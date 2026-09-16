import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseTaxRollExcel } from './parse-tax-roll-excel.js';

const HEADERS = [
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

function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  const base: Record<string, unknown> = {
    'Cédula Catastral': '000100010001',
    Destino: 'rural',
    Avaluo: 1000000,
    CCNIT: '00123456789',
    Propietario: 'Juan Perez',
    'Nombre Predio': 'Finca La Esperanza',
    periodo: 2024,
    'Impuesto Predial': 50000,
    'Interes Impuesto Predial': 1500.5,
    'C.A.R.': 2000,
    'Interes C.A.R.': 60.25,
    'Sobretasa Bomberil': 1000,
    'Interes Sobretasa Bomberil': 30.1,
    Total: 54590.85,
  };
  return { ...base, ...overrides };
}

async function buildWorkbookBuffer(
  rows: Record<string, unknown>[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('TaxRoll');
  sheet.addRow(HEADERS);
  for (const row of rows) {
    sheet.addRow(HEADERS.map((h) => row[h]));
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('parseTaxRollExcel', () => {
  it('flags a row with no owner as a warning, not an error', async () => {
    const buffer = await buildWorkbookBuffer([buildRow({ Propietario: '' })]);
    const result = await parseTaxRollExcel(buffer);

    expect(result.invalidRows).toHaveLength(0);
    expect(result.validRows).toHaveLength(1);
    expect(result.validRows[0].ownerName).toBeNull();
    expect(result.warnings).toEqual([{ row: 2, reason: 'Missing owner' }]);
  });

  it('rejects a row with no cadastral code', async () => {
    const buffer = await buildWorkbookBuffer([
      buildRow({ 'Cédula Catastral': '' }),
    ]);
    const result = await parseTaxRollExcel(buffer);

    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows).toEqual([
      { row: 2, reason: 'Missing cadastral code' },
    ]);
  });

  it('rejects a row with no period', async () => {
    const buffer = await buildWorkbookBuffer([buildRow({ periodo: '' })]);
    const result = await parseTaxRollExcel(buffer);

    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows).toEqual([
      { row: 2, reason: 'Missing period or not a valid integer' },
    ]);
  });

  it('rejects a blank workbook (no header row) with a clear error instead of crashing', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('TaxRoll');
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(parseTaxRollExcel(buffer)).rejects.toThrow(
      'The Excel file is empty: no header row was found in the first row.',
    );
  });

  it('rejects a workbook with the wrong headers with a clear error instead of crashing', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('TaxRoll');
    sheet.addRow(['Not', 'The', 'Right', 'Headers']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(parseTaxRollExcel(buffer)).rejects.toThrow(
      /Excel headers do not match/,
    );
  });

  it('processes a fully valid file, including the same property across several periods', async () => {
    const buffer = await buildWorkbookBuffer([
      buildRow({ periodo: 1980 }),
      buildRow({ periodo: 2026 }),
      buildRow({ 'Cédula Catastral': '000100010002', CCNIT: '00000000001' }),
    ]);
    const result = await parseTaxRollExcel(buffer);

    expect(result.invalidRows).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.validRows).toHaveLength(3);
    expect(result.validRows[0].period).toBe(1980);
    expect(result.validRows[1].period).toBe(2026);
    expect(result.validRows[1].taxId).toBe('00123456789');
  });
});
