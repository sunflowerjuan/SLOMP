import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { TaxRollService } from './tax-roll.service.js';
import { persistTaxRoll } from './persist-tax-roll.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';

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

// The cadastral code in buildOneRowWorkbook starts with this DANE code.
const MUNICIPALITY: MunicipalityContext = {
  id: 3,
  slug: 'demo',
  name: 'Demo',
  state: 'Boyacá',
  daneCode: '00010',
};

async function buildOneRowWorkbook(): Promise<Buffer> {
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
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

// What persistTaxRoll (mocked) reports back, and the matching TaxRollImport
// row TaxRollService.recordImport should write/update for it — shared by
// the two tests below, which only differ in whether that write is a create
// or an update.
const PERSISTED_RESULT = {
  properties: 1,
  owners: 1,
  settlements: 1,
  conflicts: [],
};
const EXPECTED_IMPORT_DATA = {
  municipalityId: MUNICIPALITY.id,
  fileName: 'roll.xlsx',
  administratorId: 7,
  validRows: 1,
  invalidRows: 0,
  warnings: 0,
  properties: 1,
  owners: 1,
  settlements: 1,
  conflicts: 0,
};

describe('TaxRollService', () => {
  it('turns a parser failure (e.g. a blank Excel file) into a 400, not an unhandled 500', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('TaxRoll');
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const service = new TaxRollService(unusedPrisma() as never);

    await expect(
      service.import(MUNICIPALITY, buffer, false, 'blank.xlsx', 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('persists the parsed rows and returns both the parse and persistence summaries', async () => {
    const buffer = await buildOneRowWorkbook();

    const taxRollImportCreate = vi.fn().mockResolvedValue({ id: 42 });
    // persistTaxRoll is mocked, so prisma only needs to support the history
    // write that TaxRollService itself makes.
    const prisma = { taxRollImport: { create: taxRollImportCreate } };
    vi.mocked(persistTaxRoll).mockResolvedValue(PERSISTED_RESULT);

    const service = new TaxRollService(prisma as never);
    const result = await service.import(
      MUNICIPALITY,
      buffer,
      true,
      'roll.xlsx',
      7,
    );

    expect(result.validRows).toHaveLength(1);
    expect(result.persisted).toEqual(PERSISTED_RESULT);
    expect(result.importId).toBe(42);
    expect(persistTaxRoll).toHaveBeenCalledWith(
      prisma,
      MUNICIPALITY.id,
      result.validRows,
      true,
    );
    expect(taxRollImportCreate).toHaveBeenCalledWith({
      data: EXPECTED_IMPORT_DATA,
    });
  });

  it('updates the previous history row instead of creating a new one when confirming a replace (HU18)', async () => {
    const buffer = await buildOneRowWorkbook();

    const taxRollImportCreate = vi.fn();
    const taxRollImportUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      taxRollImport: {
        create: taxRollImportCreate,
        updateMany: taxRollImportUpdateMany,
      },
    };
    vi.mocked(persistTaxRoll).mockResolvedValue(PERSISTED_RESULT);

    const service = new TaxRollService(prisma as never);
    const result = await service.import(
      MUNICIPALITY,
      buffer,
      true,
      'roll.xlsx',
      7,
      99,
    );

    expect(result.importId).toBe(99);
    expect(taxRollImportUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 99,
        municipalityId: MUNICIPALITY.id,
        fileName: 'roll.xlsx',
        administratorId: 7,
      },
      data: EXPECTED_IMPORT_DATA,
    });
    expect(taxRollImportCreate).not.toHaveBeenCalled();
  });

  describe('municipality of the file', () => {
    it('rejects the whole file, before saving anything, when a cadastral code has another DANE prefix', async () => {
      const buffer = await buildOneRowWorkbook();
      vi.mocked(persistTaxRoll).mockClear();
      const findMany = vi.fn().mockResolvedValue([]);
      const prisma = { municipality: { findMany } };

      const service = new TaxRollService(prisma as never);
      const error = await service
        .import(
          { ...MUNICIPALITY, daneCode: '15514' },
          buffer,
          true,
          'x.xlsx',
          7,
        )
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toMatchObject({
        code: ErrorCode.TAX_ROLL_WRONG_MUNICIPALITY,
        details: {
          expectedPrefix: '15514',
          mismatchedRows: 1,
          foundPrefixes: [{ prefix: '00010', rows: 1, municipality: null }],
        },
      });
      expect(persistTaxRoll).not.toHaveBeenCalled();
    });

    it('names the registered municipality the file seems to belong to', async () => {
      const buffer = await buildOneRowWorkbook();
      const prisma = {
        municipality: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { daneCode: '00010', name: 'Páez', state: 'Boyacá' },
            ]),
        },
      };

      const service = new TaxRollService(prisma as never);
      const error = await service
        .import(
          { ...MUNICIPALITY, daneCode: '19517', name: 'Páez', state: 'Cauca' },
          buffer,
          true,
          'x.xlsx',
          7,
        )
        .catch((e) => e);

      expect(error.getResponse().message).toContain('Páez, Boyacá');
      expect(error.getResponse().details.foundPrefixes[0].municipality).toBe(
        'Páez, Boyacá',
      );
    });
  });

  it('lists only the imports of the given municipality', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new TaxRollService({
      taxRollImport: { findMany },
    } as never);

    await service.listImports(MUNICIPALITY.id);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { municipalityId: MUNICIPALITY.id } }),
    );
  });
});
