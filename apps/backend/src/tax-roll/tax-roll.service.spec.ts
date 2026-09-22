import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { TaxRollService } from './tax-roll.service.js';
import { persistTaxRoll } from './persist-tax-roll.js';

vi.mock('./persist-tax-roll.js', () => ({ persistTaxRoll: vi.fn() }));

// A parser failure never reaches persistence, so a Prisma that throws if
// touched doubles as proof of that.
function unusedPrisma() {
  return new Proxy(
    {},
    {
      get() {
        throw new Error('PrismaService should not be used for this case');
      },
    },
  );
}

describe('TaxRollService', () => {
  it('turns a parser failure (e.g. a blank Excel file) into a 400, not an unhandled 500', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('TaxRoll');
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const service = new TaxRollService(unusedPrisma() as never);

    await expect(
      service.import(buffer, false, 'blank.xlsx', 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists the parsed rows and returns both the parse and persistence summaries', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('TaxRoll');
    sheet.addRow([
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
    ]);
    sheet.addRow([
      '000100010001',
      'rural',
      1000000,
      '00123456789',
      'Juan Pérez',
      'Finca La Esperanza',
      2024,
      50000,
      1500,
      2000,
      60,
      1000,
      30,
      54590,
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const persisted = {
      properties: 1,
      owners: 1,
      settlements: 1,
      conflicts: [],
    };
    const taxRollImportCreate = vi.fn().mockResolvedValue({ id: 42 });
    // persistTaxRoll is mocked, so prisma only needs to support the history
    // write that TaxRollService itself makes.
    const prisma = { taxRollImport: { create: taxRollImportCreate } };
    vi.mocked(persistTaxRoll).mockResolvedValue(persisted);

    const service = new TaxRollService(prisma as never);
    const result = await service.import(buffer, true, 'roll.xlsx', 7);

    expect(result.validRows).toHaveLength(1);
    expect(result.persisted).toEqual(persisted);
    expect(result.importId).toBe(42);
    expect(persistTaxRoll).toHaveBeenCalledWith(prisma, result.validRows, true);
    expect(taxRollImportCreate).toHaveBeenCalledWith({
      data: {
        fileName: 'roll.xlsx',
        administratorId: 7,
        validRows: 1,
        invalidRows: 0,
        warnings: 0,
        properties: 1,
        owners: 1,
        settlements: 1,
        conflicts: 0,
      },
    });
  });

  it('updates the previous history row instead of creating a new one when confirming a replace (HU18)', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('TaxRoll');
    sheet.addRow([
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
    ]);
    sheet.addRow([
      '000100010001',
      'rural',
      1000000,
      '00123456789',
      'Juan Pérez',
      'Finca La Esperanza',
      2024,
      50000,
      1500,
      2000,
      60,
      1000,
      30,
      54590,
    ]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const persisted = {
      properties: 1,
      owners: 1,
      settlements: 1,
      conflicts: [],
    };
    const taxRollImportCreate = vi.fn();
    const taxRollImportUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      taxRollImport: {
        create: taxRollImportCreate,
        updateMany: taxRollImportUpdateMany,
      },
    };
    vi.mocked(persistTaxRoll).mockResolvedValue(persisted);

    const service = new TaxRollService(prisma as never);
    const result = await service.import(buffer, true, 'roll.xlsx', 7, 99);

    expect(result.importId).toBe(99);
    expect(taxRollImportUpdateMany).toHaveBeenCalledWith({
      where: { id: 99, fileName: 'roll.xlsx', administratorId: 7 },
      data: {
        fileName: 'roll.xlsx',
        administratorId: 7,
        validRows: 1,
        invalidRows: 0,
        warnings: 0,
        properties: 1,
        owners: 1,
        settlements: 1,
        conflicts: 0,
      },
    });
    expect(taxRollImportCreate).not.toHaveBeenCalled();
  });
});
