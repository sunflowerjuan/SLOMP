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

    await expect(service.import(buffer)).rejects.toBeInstanceOf(
      BadRequestException,
    );
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

    const persisted = { properties: 1, owners: 1, settlements: 1 };
    const prisma = {}; // persistTaxRoll is mocked, so its shape doesn't matter here
    vi.mocked(persistTaxRoll).mockResolvedValue(persisted);

    const service = new TaxRollService(prisma as never);
    const result = await service.import(buffer);

    expect(result.validRows).toHaveLength(1);
    expect(result.persisted).toEqual(persisted);
    expect(persistTaxRoll).toHaveBeenCalledWith(prisma, result.validRows);
  });
});
