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

function cellNumber(value: ExcelJS.CellValue): number {
  if (typeof value === 'number') return value;
  const parsed = Number(cellText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

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

    const ownerName = cellText(row.getCell(5).value);
    if (!ownerName) {
      warnings.push({ row: rowNumber, reason: 'Missing owner' });
    }

    validRows.push({
      cadastralCode,
      landUse: cellText(row.getCell(2).value),
      appraisalValue: cellNumber(row.getCell(3).value),
      taxId: cellText(row.getCell(4).value),
      ownerName: ownerName || null,
      propertyName: cellText(row.getCell(6).value),
      period,
      propertyTax: cellNumber(row.getCell(8).value),
      propertyTaxInterest: cellNumber(row.getCell(9).value),
      environmentalFee: cellNumber(row.getCell(10).value),
      environmentalFeeInterest: cellNumber(row.getCell(11).value),
      fireSurcharge: cellNumber(row.getCell(12).value),
      fireSurchargeInterest: cellNumber(row.getCell(13).value),
      total: cellNumber(row.getCell(14).value),
    });
  }

  return { validRows, invalidRows, warnings };
}
