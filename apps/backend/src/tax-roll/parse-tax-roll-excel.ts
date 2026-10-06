import ExcelJS from 'exceljs';
import { CodedError } from '../common/errors/coded-error.js';
import { ErrorCode, RowIssueCode } from '../common/errors/error-codes.js';
import {
  PROPERTY_TAX_START_YEAR,
  currentYearInColombia,
  isValidPeriod,
} from './period-rules.js';
import type {
  ParseTaxRollExcelResult,
  TaxRollRowDto,
} from './tax-roll-row.dto.js';

export interface ParseTaxRollExcelOptions {
  // Injected so the period range check is deterministic in tests.
  currentYear?: number;
}

// Every .xlsx is a ZIP container, and every ZIP starts with "PK\x03\x04".
// Checking it up front turns "renamed CSV/XLS/PDF" into a clear message
// instead of a low-level unzip error.
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

const NOT_AN_XLSX_MESSAGE =
  'The file is not a valid Excel (.xlsx) workbook. It may be a different format renamed to .xlsx (CSV, old .xls, PDF, etc.) or a damaged file. Open it in Excel and save it again as "Excel Workbook (.xlsx)".';

// Literal column headers of the source file, as provided by the municipality of
// Páez — must stay in Spanish and in this exact order, they are not our naming choice.
const EXPECTED_HEADERS = [
  'Cédula Catastral',
  'Destino',
  'Avaluo',
  'CCNIT',
  'Propietario',
  'Nombre Predio',
  'periodo',
  'Impuesto Predial',
  'Interes Impuesto Predial',
  'C.A.R.',
  'Interes C.A.R.',
  'Sobretasa Bomberil',
  'Interes Sobretasa Bomberil',
  'Total',
];

const OPTIONAL_HEADERS = {
  Vereda: 'ruralDistrict',
  Barrio: 'neighborhood',
  Latitud: 'latitude',
  Longitud: 'longitude',
} as const;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    if ('text' in value) return String(value.text ?? '').trim();
    if ('result' in value) return String(value.result ?? '').trim();
  }
  return String(value).trim();
}

// A blank cell is a legitimate 0 (many rows have no C.A.R. or surcharge to
// pay); anything non-blank that isn't a finite number is a data problem, not
// a zero — those two cases must stay distinguishable.
const INVALID_AMOUNT = Symbol('invalid amount');

function cellAmount(value: ExcelJS.CellValue): number | typeof INVALID_AMOUNT {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : INVALID_AMOUNT;
  const text = cellText(value);
  if (text === '') return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : INVALID_AMOUNT;
}

const AMOUNT_COLUMNS = [
  { header: 'Avaluo', label: 'Avaluo' },
  { header: 'Impuesto Predial', label: 'Impuesto Predial' },
  { header: 'Interes Impuesto Predial', label: 'Interes Impuesto Predial' },
  { header: 'C.A.R.', label: 'C.A.R.' },
  { header: 'Interes C.A.R.', label: 'Interes C.A.R.' },
  { header: 'Sobretasa Bomberil', label: 'Sobretasa Bomberil' },
  { header: 'Interes Sobretasa Bomberil', label: 'Interes Sobretasa Bomberil' },
  { header: 'Total', label: 'Total' },
] as const;

export async function parseTaxRollExcel(
  buffer: Buffer,
  options: ParseTaxRollExcelOptions = {},
): Promise<ParseTaxRollExcelResult> {
  const currentYear = options.currentYear ?? currentYearInColombia();

  if (buffer.length === 0) {
    throw new CodedError(
      ErrorCode.TAX_ROLL_FILE_EMPTY,
      'The uploaded file is empty (0 bytes).',
    );
  }
  if (!buffer.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE)) {
    throw new CodedError(ErrorCode.TAX_ROLL_NOT_XLSX, NOT_AN_XLSX_MESSAGE);
  }

  const workbook = new ExcelJS.Workbook();
  try {
    // ponytail: exceljs's own .d.ts declares a local `Buffer extends ArrayBuffer` shim that a
    // real Node Buffer never structurally satisfies — upstream typings bug, not a runtime issue.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any);
  } catch {
    // Truncated or corrupted ZIP: the library message is not useful to the
    // Administrator.
    throw new CodedError(ErrorCode.TAX_ROLL_NOT_XLSX, NOT_AN_XLSX_MESSAGE);
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    // A ZIP that is not a workbook (e.g. a .docx renamed to .xlsx).
    throw new CodedError(ErrorCode.TAX_ROLL_NOT_XLSX, NOT_AN_XLSX_MESSAGE);
  }

  const headerRow = sheet.getRow(1);
  if (headerRow.actualCellCount === 0) {
    throw new CodedError(
      ErrorCode.TAX_ROLL_NO_HEADER_ROW,
      'The Excel file is empty: no header row was found in the first row.',
    );
  }

  const headerIndexes = new Map<string, number>();
  const headers: string[] = [];
  for (let column = 1; column <= headerRow.cellCount; column++) {
    const header = cellText(headerRow.getCell(column).value);
    headers.push(header);
    if (header && !headerIndexes.has(header)) headerIndexes.set(header, column);
  }
  const requiredHeaders = headers.filter((header) =>
    EXPECTED_HEADERS.includes(header),
  );
  const headersMatch =
    EXPECTED_HEADERS.length === requiredHeaders.length &&
    EXPECTED_HEADERS.every((expected, i) => requiredHeaders[i] === expected);
  if (!headersMatch) {
    const missingHeaders = EXPECTED_HEADERS.filter(
      (expected) => !headerIndexes.has(expected),
    );
    const detail =
      missingHeaders.length > 0
        ? `Missing required column(s): ${missingHeaders.join(', ')}.`
        : 'All required columns are present but not in the expected order.';
    throw new CodedError(
      ErrorCode.TAX_ROLL_HEADERS_MISMATCH,
      `Excel headers do not match what was expected. ${detail} Expected order: [${EXPECTED_HEADERS.join(', ')}]. Received: [${headers.join(', ')}]`,
      {
        missingColumns: missingHeaders,
        expectedColumns: [...EXPECTED_HEADERS],
      },
    );
  }

  const validRows: TaxRollRowDto[] = [];
  const invalidRows: ParseTaxRollExcelResult['invalidRows'] = [];
  const warnings: ParseTaxRollExcelResult['warnings'] = [];
  const column = (header: string) => headerIndexes.get(header)!;
  const optionalColumn = (header: keyof typeof OPTIONAL_HEADERS) =>
    headerIndexes.get(header);
  // Business key of a row: cadastral code + period. The first valid row that
  // uses a key wins; later ones are reported instead of silently overwriting
  // it (persistTaxRoll would otherwise keep only the last one).
  const firstRowByKey = new Map<string, number>();
  let dataRowCount = 0;

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.actualCellCount === 0) continue;
    dataRowCount++;

    const cadastralCode = cellText(
      row.getCell(column('Cédula Catastral')).value,
    );
    const periodText = cellText(row.getCell(column('periodo')).value);

    if (!cadastralCode) {
      invalidRows.push({
        row: rowNumber,
        code: RowIssueCode.MISSING_CADASTRAL_CODE,
        reason: 'Missing cadastral code',
      });
      continue;
    }

    const period = Number(periodText);
    if (!periodText || !Number.isInteger(period)) {
      invalidRows.push({
        row: rowNumber,
        code: RowIssueCode.INVALID_PERIOD,
        reason: 'Missing period or not a valid integer',
      });
      continue;
    }
    if (!isValidPeriod(period, currentYear)) {
      invalidRows.push({
        row: rowNumber,
        code: RowIssueCode.PERIOD_OUT_OF_RANGE,
        reason: `Period ${period} is out of range: it must be between ${PROPERTY_TAX_START_YEAR} and ${currentYear}`,
        details: { period, min: PROPERTY_TAX_START_YEAR, max: currentYear },
      });
      continue;
    }

    const taxId = cellText(row.getCell(column('CCNIT')).value);
    if (!taxId) {
      invalidRows.push({
        row: rowNumber,
        code: RowIssueCode.MISSING_OWNER_DOCUMENT,
        reason: 'Missing owner document/tax ID (CCNIT)',
      });
      continue;
    }

    const amounts: Record<(typeof AMOUNT_COLUMNS)[number]['label'], number> =
      {} as never;
    const invalidColumns: string[] = [];
    for (const { header, label } of AMOUNT_COLUMNS) {
      const amount = cellAmount(row.getCell(column(header)).value);
      if (amount === INVALID_AMOUNT) {
        invalidColumns.push(label);
      } else {
        amounts[label] = amount;
      }
    }
    if (invalidColumns.length > 0) {
      invalidRows.push({
        row: rowNumber,
        code: RowIssueCode.NON_NUMERIC_VALUE,
        reason: `Non-numeric value in column(s): ${invalidColumns.join(', ')}`,
        details: { columns: invalidColumns },
      });
      continue;
    }

    const optionalValues: Partial<
      Record<keyof typeof OPTIONAL_HEADERS, string | number | null>
    > = {};
    const invalidCoordinates: string[] = [];
    for (const [header, field] of Object.entries(OPTIONAL_HEADERS) as [
      keyof typeof OPTIONAL_HEADERS,
      (typeof OPTIONAL_HEADERS)[keyof typeof OPTIONAL_HEADERS],
    ][]) {
      const index = optionalColumn(header);
      const value =
        index === undefined ? '' : cellText(row.getCell(index).value);
      if (field === 'latitude' || field === 'longitude') {
        if (!value) {
          optionalValues[header] = null;
          continue;
        }
        const coordinate = Number(value);
        const min = field === 'latitude' ? -90 : -180;
        const max = field === 'latitude' ? 90 : 180;
        if (
          !Number.isFinite(coordinate) ||
          coordinate < min ||
          coordinate > max
        ) {
          invalidCoordinates.push(header);
        } else {
          optionalValues[header] = coordinate;
        }
      } else {
        optionalValues[header] = value || null;
      }
    }
    if (invalidCoordinates.length > 0) {
      invalidRows.push({
        row: rowNumber,
        code: RowIssueCode.INVALID_COORDINATE,
        reason: `Invalid coordinate value in column(s): ${invalidCoordinates.join(', ')}`,
        details: { columns: invalidCoordinates },
      });
      continue;
    }

    // Checked last so a key is only taken by a row that is otherwise valid.
    const businessKey = `${cadastralCode}:${period}`;
    const firstRow = firstRowByKey.get(businessKey);
    if (firstRow !== undefined) {
      invalidRows.push({
        row: rowNumber,
        code: RowIssueCode.DUPLICATE_KEY,
        reason: `Duplicate cadastral code + period (${cadastralCode}, ${period}): already in row ${firstRow}`,
        details: { cadastralCode, period, firstRow },
      });
      continue;
    }
    firstRowByKey.set(businessKey, rowNumber);

    // cellText trims, so the padded blanks of the real file ('   ') end up
    // as an empty owner: a warning, never a rejected row.
    const ownerName = cellText(row.getCell(column('Propietario')).value);
    if (!ownerName) {
      warnings.push({
        row: rowNumber,
        code: RowIssueCode.MISSING_OWNER,
        reason: 'Missing owner',
      });
    }

    validRows.push({
      cadastralCode,
      landUse: cellText(row.getCell(column('Destino')).value),
      appraisalValue: amounts['Avaluo'],
      ruralDistrict: optionalValues.Vereda as string | null,
      neighborhood: optionalValues.Barrio as string | null,
      latitude: optionalValues.Latitud as number | null,
      longitude: optionalValues.Longitud as number | null,
      taxId,
      ownerName: ownerName || null,
      propertyName: cellText(row.getCell(column('Nombre Predio')).value),
      period,
      propertyTax: amounts['Impuesto Predial'],
      propertyTaxInterest: amounts['Interes Impuesto Predial'],
      environmentalFee: amounts['C.A.R.'],
      environmentalFeeInterest: amounts['Interes C.A.R.'],
      fireSurcharge: amounts['Sobretasa Bomberil'],
      fireSurchargeInterest: amounts['Interes Sobretasa Bomberil'],
      total: amounts['Total'],
    });
  }

  if (dataRowCount === 0) {
    throw new CodedError(
      ErrorCode.TAX_ROLL_NO_DATA_ROWS,
      'The Excel file has the expected headers but no data rows.',
    );
  }

  return { validRows, invalidRows, warnings };
}
