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

  it('rejects a row with no owner document/tax ID', async () => {
    const buffer = await buildWorkbookBuffer([buildRow({ CCNIT: '' })]);
    const result = await parseTaxRollExcel(buffer);

    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows).toEqual([
      { row: 2, reason: 'Missing owner document/tax ID (CCNIT)' },
    ]);
  });

  it('rejects a row with a non-numeric amount instead of silently treating it as zero', async () => {
    const buffer = await buildWorkbookBuffer([
      buildRow({ 'Impuesto Predial': 'N/A', Total: 'ver nota' }),
    ]);
    const result = await parseTaxRollExcel(buffer);

    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows).toEqual([
      {
        row: 2,
        reason: 'Non-numeric value in column(s): Impuesto Predial, Total',
      },
    ]);
  });

  it('accepts a blank amount cell as zero', async () => {
    const buffer = await buildWorkbookBuffer([
      buildRow({ 'Sobretasa Bomberil': '', 'Interes Sobretasa Bomberil': '' }),
    ]);
    const result = await parseTaxRollExcel(buffer);

    expect(result.invalidRows).toHaveLength(0);
    expect(result.validRows[0].fireSurcharge).toBe(0);
    expect(result.validRows[0].fireSurchargeInterest).toBe(0);
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

  describe('file-level checks (SL-81)', () => {
    const NOT_AN_XLSX = /not a valid Excel \(\.xlsx\) workbook/;

    it('rejects a 0-byte file with a clear message', async () => {
      await expect(parseTaxRollExcel(Buffer.alloc(0))).rejects.toThrow(
        'The uploaded file is empty (0 bytes).',
      );
    });

    it('rejects a CSV renamed to .xlsx with a clear message instead of the unzip error', async () => {
      const csv = Buffer.from('Cédula Catastral,periodo\n000100010001,2024\n');
      await expect(parseTaxRollExcel(csv)).rejects.toThrow(NOT_AN_XLSX);
    });

    it('rejects an old binary .xls renamed to .xlsx', async () => {
      const xls = Buffer.concat([
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
        Buffer.alloc(512),
      ]);
      await expect(parseTaxRollExcel(xls)).rejects.toThrow(NOT_AN_XLSX);
    });

    it('rejects a truncated (corrupted) .xlsx', async () => {
      const buffer = await buildWorkbookBuffer([buildRow()]);
      await expect(
        parseTaxRollExcel(buffer.subarray(0, buffer.length / 2)),
      ).rejects.toThrow(NOT_AN_XLSX);
    });

    it('names the missing columns when the headers are incomplete', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('TaxRoll');
      sheet.addRow(HEADERS.filter((h) => h !== 'periodo' && h !== 'Total'));
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

      await expect(parseTaxRollExcel(buffer)).rejects.toThrow(
        'Missing required column(s): periodo, Total.',
      );
    });

    it('says so when every column is present but out of order', async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('TaxRoll');
      sheet.addRow([...HEADERS].reverse());
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

      await expect(parseTaxRollExcel(buffer)).rejects.toThrow(
        'All required columns are present but not in the expected order.',
      );
    });

    it('rejects a file with headers but no data rows instead of importing nothing silently', async () => {
      const buffer = await buildWorkbookBuffer([]);
      await expect(parseTaxRollExcel(buffer)).rejects.toThrow(
        'The Excel file has the expected headers but no data rows.',
      );
    });
  });

  describe('period range (SL-81)', () => {
    const options = { currentYear: 2026 };

    it.each([1980, 2021, 2022, 2026])('accepts period %i', async (periodo) => {
      const buffer = await buildWorkbookBuffer([buildRow({ periodo })]);
      const result = await parseTaxRollExcel(buffer, options);

      expect(result.invalidRows).toHaveLength(0);
      expect(result.validRows[0].period).toBe(periodo);
    });

    it.each([1979, 2027, 1900])(
      'rejects period %i with the valid range in the reason',
      async (periodo) => {
        const buffer = await buildWorkbookBuffer([buildRow({ periodo })]);
        const result = await parseTaxRollExcel(buffer, options);

        expect(result.validRows).toHaveLength(0);
        expect(result.invalidRows).toEqual([
          {
            row: 2,
            reason: `Period ${periodo} is out of range: it must be between 1980 and 2026`,
          },
        ]);
      },
    );
  });

  describe('business key: cadastral code + period (SL-81)', () => {
    it('reports a duplicated key instead of letting the last row silently win', async () => {
      const buffer = await buildWorkbookBuffer([
        buildRow({ periodo: 2024, Total: 100 }),
        buildRow({ periodo: 2025 }),
        buildRow({ periodo: 2024, Total: 999 }),
      ]);
      const result = await parseTaxRollExcel(buffer, { currentYear: 2026 });

      expect(result.validRows.map((r) => [r.period, r.total])).toEqual([
        [2024, 100],
        [2025, 54590.85],
      ]);
      expect(result.invalidRows).toEqual([
        {
          row: 4,
          reason:
            'Duplicate cadastral code + period (000100010001, 2024): already in row 2',
        },
      ]);
    });

    it('does not let an invalid row take the key from a later valid one', async () => {
      const buffer = await buildWorkbookBuffer([
        buildRow({ periodo: 2024, Total: 'N/A' }),
        buildRow({ periodo: 2024 }),
      ]);
      const result = await parseTaxRollExcel(buffer, { currentYear: 2026 });

      expect(result.validRows).toHaveLength(1);
      expect(result.invalidRows).toEqual([
        { row: 2, reason: 'Non-numeric value in column(s): Total' },
      ]);
    });
  });

  describe('blank owner as in the real Páez file (SL-81)', () => {
    it('treats an owner made only of spaces as empty (null) and keeps the row', async () => {
      const buffer = await buildWorkbookBuffer([
        buildRow({ Propietario: '   ' }),
      ]);
      const result = await parseTaxRollExcel(buffer, { currentYear: 2026 });

      expect(result.invalidRows).toHaveLength(0);
      expect(result.validRows[0].ownerName).toBeNull();
      expect(result.warnings).toEqual([{ row: 2, reason: 'Missing owner' }]);
    });

    it('keeps all 399 padded-blank owner rows (23 properties) as valid rows', async () => {
      // Same shape as the real file: 23 properties, 399 rows, owner = '   '.
      const rows: Record<string, unknown>[] = [];
      for (let p = 0; rows.length < 399; p = (p + 1) % 23) {
        const periodo = 2026 - Math.floor(rows.length / 23);
        rows.push(
          buildRow({
            'Cédula Catastral': `0009000${String(p).padStart(5, '0')}`,
            Propietario: '   ',
            periodo,
          }),
        );
      }
      const buffer = await buildWorkbookBuffer(rows);
      const result = await parseTaxRollExcel(buffer, { currentYear: 2026 });

      expect(result.invalidRows).toHaveLength(0);
      expect(result.validRows).toHaveLength(399);
      expect(new Set(result.validRows.map((r) => r.cadastralCode)).size).toBe(
        23,
      );
      expect(result.validRows.every((r) => r.ownerName === null)).toBe(true);
      expect(result.warnings).toHaveLength(399);
    });

    it('trims padding around a real owner name', async () => {
      const buffer = await buildWorkbookBuffer([
        buildRow({ Propietario: '  JUAN PEREZ        ' }),
      ]);
      const result = await parseTaxRollExcel(buffer, { currentYear: 2026 });

      expect(result.validRows[0].ownerName).toBe('JUAN PEREZ');
      expect(result.warnings).toHaveLength(0);
    });
  });
});
