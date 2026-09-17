import ExcelJS from 'exceljs';
import type {
  ParseTaxRollExcelResult,
  TaxRollRowDto,
} from './tax-roll-row.dto.js';

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
  { index: 3, label: 'Avaluo' },
  { index: 8, label: 'Impuesto Predial' },
  { index: 9, label: 'Interes Impuesto Predial' },
  { index: 10, label: 'C.A.R.' },
  { index: 11, label: 'Interes C.A.R.' },
  { index: 12, label: 'Sobretasa Bomberil' },
  { index: 13, label: 'Interes Sobretasa Bomberil' },
  { index: 14, label: 'Total' },
] as const;

export async function parseTaxRollExcel(
  buffer: Buffer,
): Promise<ParseTaxRollExcelResult> {
  const workbook = new ExcelJS.Workbook();
  // ponytail: exceljs's own .d.ts declares a local `Buffer extends ArrayBuffer` shim that a
  // real Node Buffer never structurally satisfies — upstream typings bug, not a runtime issue.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('The Excel file does not contain any sheets.');
  }

  const headerRow = sheet.getRow(1);
  if (headerRow.actualCellCount === 0) {
    throw new Error(
      'The Excel file is empty: no header row was found in the first row.',
    );
  }

  const headers = EXPECTED_HEADERS.map((_, i) =>
    cellText(headerRow.getCell(i + 1).value),
  );
  const headersMatch = EXPECTED_HEADERS.every(
    (expected, i) => headers[i] === expected,
  );
  if (!headersMatch) {
    throw new Error(
      `Excel headers do not match what was expected. Expected: [${EXPECTED_HEADERS.join(', ')}]. Received: [${headers.join(', ')}]`,
    );
  }

  const validRows: TaxRollRowDto[] = [];
  const invalidRows: ParseTaxRollExcelResult['invalidRows'] = [];
  const warnings: ParseTaxRollExcelResult['warnings'] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.actualCellCount === 0) continue;

    const cadastralCode = cellText(row.getCell(1).value);
    const periodText = cellText(row.getCell(7).value);

    if (!cadastralCode) {
      invalidRows.push({ row: rowNumber, reason: 'Missing cadastral code' });
      continue;
    }

    const period = Number(periodText);
    if (!periodText || !Number.isInteger(period)) {
      invalidRows.push({
        row: rowNumber,
        reason: 'Missing period or not a valid integer',
      });
      continue;
    }

    const taxId = cellText(row.getCell(4).value);
    if (!taxId) {
      invalidRows.push({
        row: rowNumber,
        reason: 'Missing owner document/tax ID (CCNIT)',
      });
      continue;
    }

    const amounts: Record<(typeof AMOUNT_COLUMNS)[number]['label'], number> =
      {} as never;
    const invalidColumns: string[] = [];
    for (const { index, label } of AMOUNT_COLUMNS) {
      const amount = cellAmount(row.getCell(index).value);
      if (amount === INVALID_AMOUNT) {
        invalidColumns.push(label);
      } else {
        amounts[label] = amount;
      }
    }
    if (invalidColumns.length > 0) {
      invalidRows.push({
        row: rowNumber,
        reason: `Non-numeric value in column(s): ${invalidColumns.join(', ')}`,
      });
      continue;
    }

    const ownerName = cellText(row.getCell(5).value);
    if (!ownerName) {
      warnings.push({ row: rowNumber, reason: 'Missing owner' });
    }

    validRows.push({
      cadastralCode,
      landUse: cellText(row.getCell(2).value),
      appraisalValue: amounts['Avaluo'],
      taxId,
      ownerName: ownerName || null,
      propertyName: cellText(row.getCell(6).value),
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

  return { validRows, invalidRows, warnings };
}
