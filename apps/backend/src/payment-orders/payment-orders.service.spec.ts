import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { PaymentOrdersService } from './payment-orders.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-01T12:00:00.000Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const MUNICIPALITY: MunicipalityContext = {
  id: 7,
  slug: 'paez',
  name: 'Páez',
  state: 'Boyacá',
  daneCode: '15514',
};
const code = (suffix: string) => `15514${suffix}`.padEnd(30, '0');

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

// The payment orders Excel has the tax roll columns.
async function workbookWith(rows: { cadastralCode: string; period: number }[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Mandamientos');
  sheet.addRow(HEADERS);
  for (const row of rows) {
    sheet.addRow([
      row.cadastralCode,
      'rural',
      1000000,
      '00123456789',
      'Juan Pérez',
      'Finca La Esperanza',
      row.period,
      50000,
      1500,
      2000,
      60,
      1000,
      30,
      54590,
    ]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

interface FakeSettlement {
  id: number;
  period: number;
  status?: string;
  replacedAt?: Date | null;
  cadastralCode: string;
  resolution?: { number: string; issuedAt: Date } | null;
  hasPaymentOrder?: boolean;
}

const toRow = (s: FakeSettlement) => ({
  id: s.id,
  period: s.period,
  status: s.status ?? 'VIGENTE',
  replacedAt: s.replacedAt ?? null,
  property: { cadastralCode: s.cadastralCode },
  resolution:
    s.resolution === undefined
      ? { number: '2026-0001', issuedAt: daysAgo(90) }
      : s.resolution,
  paymentOrder: s.hasPaymentOrder ? { id: 1 } : null,
});

function buildPrisma(settlements: FakeSettlement[] = []) {
  const tx = {
    paymentOrderCounter: {
      upsert: vi.fn(
        async ({ create }: { create: { lastSequence: number } }) => ({
          lastSequence: create.lastSequence,
        }),
      ),
    },
    paymentOrder: {
      // Like the real call, returns only the selected fields.
      createManyAndReturn: vi.fn(
        async ({
          data,
        }: {
          data: { settlementId: number; number: string }[];
        }) =>
          data.map((d) => ({
            settlementId: d.settlementId,
            number: d.number,
            issuedAt: NOW,
          })),
      ),
    },
  };
  const prisma = {
    municipality: { findMany: vi.fn().mockResolvedValue([]) },
    settlement: {
      findMany: vi.fn(async () => settlements.map(toRow)),
    },
    paymentOrder: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, tx };
}

describe('PaymentOrdersService.previewImport', () => {
  it('says which periods of the file can get a payment order now, and why the rest cannot', async () => {
    const { prisma } = buildPrisma([
      { id: 1, period: 2023, cadastralCode: code('1') },
      {
        id: 2,
        period: 2023,
        cadastralCode: code('2'),
        resolution: { number: '2026-0002', issuedAt: daysAgo(30) },
      },
      { id: 3, period: 2023, cadastralCode: code('3'), hasPaymentOrder: true },
      { id: 4, period: 2023, cadastralCode: code('4'), status: 'PAGADA' },
      { id: 5, period: 2023, cadastralCode: code('5'), resolution: null },
    ]);
    const service = new PaymentOrdersService(prisma as never);
    const buffer = await workbookWith([
      { cadastralCode: code('1'), period: 2023 },
      { cadastralCode: code('2'), period: 2023 },
      { cadastralCode: code('3'), period: 2023 },
      { cadastralCode: code('4'), period: 2023 },
      { cadastralCode: code('5'), period: 2023 },
      { cadastralCode: code('6'), period: 2023 },
    ]);

    const preview = await service.previewImport(
      MUNICIPALITY,
      buffer,
      'mandamientos.xlsx',
      NOW,
    );

    expect(preview.fileName).toBe('mandamientos.xlsx');
    expect(preview.rows).toBe(6);
    expect(preview.eligible).toEqual([
      {
        cadastralCode: code('1'),
        period: 2023,
        settlementId: 1,
        resolutionNumber: '2026-0001',
      },
    ]);
    expect(
      preview.ineligible.map((row) => [row.settlementId, row.reason]),
    ).toEqual([
      [2, 'NOT_YET_FIRM'],
      [3, 'ALREADY_HAS_PAYMENT_ORDER'],
      [4, 'STATUS_NOT_ELIGIBLE'],
      [5, 'NO_RESOLUTION'],
      [null, 'SETTLEMENT_NOT_FOUND'],
    ]);
  });

  it('tells when a settlement that is not firm yet will be', async () => {
    const issuedAt = daysAgo(30);
    const { prisma } = buildPrisma([
      {
        id: 2,
        period: 2023,
        cadastralCode: code('2'),
        resolution: { number: '2026-0002', issuedAt },
      },
    ]);
    const service = new PaymentOrdersService(prisma as never);

    const preview = await service.previewImport(
      MUNICIPALITY,
      await workbookWith([{ cadastralCode: code('2'), period: 2023 }]),
      'x.xlsx',
      NOW,
    );

    expect(preview.ineligible[0]!.firmOn).toEqual(
      new Date(issuedAt.getTime() + 60 * DAY_MS),
    );
  });

  it('looks settlements up in the active municipality only', async () => {
    const { prisma } = buildPrisma();
    const service = new PaymentOrdersService(prisma as never);

    await service.previewImport(
      MUNICIPALITY,
      await workbookWith([{ cadastralCode: code('1'), period: 2023 }]),
      'x.xlsx',
      NOW,
    );

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          replacedAt: null,
          property: {
            municipalityId: MUNICIPALITY.id,
            cadastralCode: { in: [code('1')] },
          },
        },
      }),
    );
  });

  it('reports a property+period listed twice only once', async () => {
    const { prisma } = buildPrisma([
      { id: 1, period: 2023, cadastralCode: code('1') },
    ]);
    const service = new PaymentOrdersService(prisma as never);

    const preview = await service.previewImport(
      MUNICIPALITY,
      await workbookWith([
        { cadastralCode: code('1'), period: 2023 },
        { cadastralCode: code('1'), period: 2023 },
      ]),
      'x.xlsx',
      NOW,
    );

    expect(preview.rows).toBe(1);
    expect(preview.eligible).toHaveLength(1);
  });

  it('handles several periods of one property independently', async () => {
    const { prisma } = buildPrisma([
      { id: 1, period: 2022, cadastralCode: code('1') },
      {
        id: 2,
        period: 2023,
        cadastralCode: code('1'),
        resolution: { number: '2026-0005', issuedAt: daysAgo(5) },
      },
    ]);
    const service = new PaymentOrdersService(prisma as never);

    const preview = await service.previewImport(
      MUNICIPALITY,
      await workbookWith([
        { cadastralCode: code('1'), period: 2022 },
        { cadastralCode: code('1'), period: 2023 },
      ]),
      'x.xlsx',
      NOW,
    );

    expect(preview.eligible.map((r) => r.period)).toEqual([2022]);
    expect(preview.ineligible.map((r) => r.period)).toEqual([2023]);
  });

  describe('validated like the tax roll', () => {
    it('rejects the whole file when a cadastral code has another DANE prefix, without touching settlements', async () => {
      const { prisma } = buildPrisma();
      const service = new PaymentOrdersService(prisma as never);
      const buffer = await workbookWith([
        { cadastralCode: code('1'), period: 2023 },
        { cadastralCode: '19517'.padEnd(30, '0'), period: 2023 },
      ]);

      const error = await service
        .previewImport(MUNICIPALITY, buffer, 'x.xlsx', NOW)
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.getResponse()).toMatchObject({
        code: ErrorCode.TAX_ROLL_WRONG_MUNICIPALITY,
        details: { expectedPrefix: '15514', mismatchedRows: 1 },
      });
      expect(prisma.settlement.findMany).not.toHaveBeenCalled();
    });

    it('names the registered municipality the file seems to belong to', async () => {
      const { prisma } = buildPrisma();
      prisma.municipality.findMany.mockResolvedValue([
        { daneCode: '19517', name: 'Páez', state: 'Cauca' },
      ]);
      const service = new PaymentOrdersService(prisma as never);

      const error = await service
        .previewImport(
          MUNICIPALITY,
          await workbookWith([
            { cadastralCode: '19517'.padEnd(30, '0'), period: 2023 },
          ]),
          'x.xlsx',
          NOW,
        )
        .catch((e) => e);

      expect(error.getResponse().message).toContain('Páez, Cauca');
    });

    it('turns an unreadable file into a 400, like the tax roll', async () => {
      const { prisma } = buildPrisma();
      const service = new PaymentOrdersService(prisma as never);
      const blank = new ExcelJS.Workbook();
      blank.addWorksheet('Blank');

      await expect(
        service.previewImport(
          MUNICIPALITY,
          Buffer.from(await blank.xlsx.writeBuffer()),
          'blank.xlsx',
          NOW,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.previewImport(
          MUNICIPALITY,
          Buffer.from('not an xlsx'),
          'x.xlsx',
          NOW,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: ErrorCode.TAX_ROLL_NOT_XLSX,
        }),
      });
    });

    it('passes the invalid rows of the parser through', async () => {
      const { prisma } = buildPrisma();
      const service = new PaymentOrdersService(prisma as never);

      const preview = await service.previewImport(
        MUNICIPALITY,
        await workbookWith([
          { cadastralCode: code('1'), period: 2023 },
          { cadastralCode: code('2'), period: 1900 },
        ]),
        'x.xlsx',
        NOW,
      );

      expect(preview.invalidRows).toHaveLength(1);
      expect(preview.invalidRows[0]!.code).toBe('PERIOD_OUT_OF_RANGE');
      expect(preview.rows).toBe(1);
    });
  });
});

describe('PaymentOrdersService.generate', () => {
  it('generates a payment order for a firm settlement, numbered and dated now', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2023, cadastralCode: code('1') },
    ]);
    const service = new PaymentOrdersService(prisma as never);

    const result = await service.generate(MUNICIPALITY.id, 9, [1], NOW);

    expect(result.rejected).toEqual([]);
    expect(result.created).toEqual([
      { settlementId: 1, number: '2026-0001', issuedAt: NOW },
    ]);
    expect(tx.paymentOrder.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          {
            municipalityId: MUNICIPALITY.id,
            settlementId: 1,
            administratorId: 9,
            number: '2026-0001',
            year: 2026,
            sequence: 1,
            issuedAt: NOW,
          },
        ],
      }),
    );
  });

  it('cannot generate a payment order before 60 days from the resolution', async () => {
    const { prisma, tx } = buildPrisma([
      {
        id: 1,
        period: 2023,
        cadastralCode: code('1'),
        resolution: { number: '2026-0001', issuedAt: daysAgo(59) },
      },
    ]);
    const service = new PaymentOrdersService(prisma as never);

    const result = await service.generate(MUNICIPALITY.id, 9, [1], NOW);

    expect(result.created).toEqual([]);
    expect(result.rejected).toEqual([
      {
        settlementId: 1,
        reason: 'NOT_YET_FIRM',
        firmOn: new Date(daysAgo(59).getTime() + 60 * DAY_MS),
      },
    ]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.paymentOrder.createManyAndReturn).not.toHaveBeenCalled();
  });

  it('can generate it exactly 60 days after the resolution', async () => {
    const { prisma } = buildPrisma([
      {
        id: 1,
        period: 2023,
        cadastralCode: code('1'),
        resolution: { number: '2026-0001', issuedAt: daysAgo(60) },
      },
    ]);
    const service = new PaymentOrdersService(prisma as never);

    const result = await service.generate(MUNICIPALITY.id, 9, [1], NOW);

    expect(result.created).toHaveLength(1);
  });

  it('generates the eligible ones and reports the rest with their reason', async () => {
    const { prisma } = buildPrisma([
      { id: 1, period: 2022, cadastralCode: code('1') },
      { id: 2, period: 2023, cadastralCode: code('1'), status: 'PAGADA' },
      { id: 3, period: 2024, cadastralCode: code('1') },
      { id: 4, period: 2025, cadastralCode: code('1'), hasPaymentOrder: true },
    ]);
    const service = new PaymentOrdersService(prisma as never);

    const result = await service.generate(
      MUNICIPALITY.id,
      9,
      [1, 2, 3, 4, 99],
      NOW,
    );

    expect(result.created.map((c) => [c.settlementId, c.number])).toEqual([
      [1, '2026-0001'],
      [3, '2026-0002'],
    ]);
    expect(result.rejected.map((r) => [r.settlementId, r.reason])).toEqual([
      [2, 'STATUS_NOT_ELIGIBLE'],
      [4, 'ALREADY_HAS_PAYMENT_ORDER'],
      [99, 'SETTLEMENT_NOT_FOUND'],
    ]);
  });

  it('reserves all the numbers in one block, inside the same transaction as the orders', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2022, cadastralCode: code('1') },
      { id: 2, period: 2023, cadastralCode: code('1') },
      { id: 3, period: 2024, cadastralCode: code('1') },
    ]);
    const service = new PaymentOrdersService(prisma as never);

    await service.generate(MUNICIPALITY.id, 9, [1, 2, 3], NOW);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.paymentOrderCounter.upsert).toHaveBeenCalledTimes(1);
    expect(tx.paymentOrderCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          municipalityId_year: { municipalityId: MUNICIPALITY.id, year: 2026 },
        },
      }),
    );
  });

  it('counts the year in Colombia: late on Dec 31 is still that year', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2022, cadastralCode: code('1') },
    ]);
    const service = new PaymentOrdersService(prisma as never);
    // 2027-01-01 02:00 UTC is still Dec 31 2026 in Bogotá.
    const lateOnNewYearsEve = new Date('2027-01-01T02:00:00.000Z');

    await service.generate(MUNICIPALITY.id, 9, [1], lateOnNewYearsEve);

    expect(tx.paymentOrder.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ year: 2026, number: '2026-0001' })],
      }),
    );
  });

  it('answers "not found" for a settlement of another municipality, and looks only inside its own', async () => {
    // The scoped lookup finds nothing for an id that belongs to another municipality.
    const { prisma } = buildPrisma([]);
    const service = new PaymentOrdersService(prisma as never);

    const result = await service.generate(MUNICIPALITY.id, 9, [500], NOW);

    expect(result.created).toEqual([]);
    expect(result.rejected).toEqual([
      { settlementId: 500, reason: 'SETTLEMENT_NOT_FOUND' },
    ]);
    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [500] },
          property: { municipalityId: MUNICIPALITY.id },
        },
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('treats a repeated id once', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2022, cadastralCode: code('1') },
    ]);
    const service = new PaymentOrdersService(prisma as never);

    const result = await service.generate(MUNICIPALITY.id, 9, [1, 1, 1], NOW);

    expect(result.created).toHaveLength(1);
    expect(tx.paymentOrder.createManyAndReturn).toHaveBeenCalledTimes(1);
  });

  it('answers 409 when another request generated the same settlement first, saving nothing', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2022, cadastralCode: code('1') },
    ]);
    tx.paymentOrder.createManyAndReturn.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    const service = new PaymentOrdersService(prisma as never);

    const error = await service
      .generate(MUNICIPALITY.id, 9, [1], NOW)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse().code).toBe(
      ErrorCode.PAYMENT_ORDER_CONCURRENT_GENERATION,
    );
  });

  it('lets any other error through', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2022, cadastralCode: code('1') },
    ]);
    tx.paymentOrder.createManyAndReturn.mockRejectedValue(new Error('boom'));
    const service = new PaymentOrdersService(prisma as never);

    await expect(
      service.generate(MUNICIPALITY.id, 9, [1], NOW),
    ).rejects.toThrow('boom');
  });
});

describe('PaymentOrdersService.list', () => {
  it('lists only the payment orders of the municipality', async () => {
    const { prisma } = buildPrisma();
    prisma.paymentOrder.findMany.mockResolvedValue([
      {
        id: 3,
        number: '2026-0003',
        issuedAt: NOW,
        settlementId: 11,
        settlement: { period: 2023, property: { cadastralCode: code('1') } },
      },
    ]);
    const service = new PaymentOrdersService(prisma as never);

    const orders = await service.list(MUNICIPALITY.id);

    expect(prisma.paymentOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { municipalityId: MUNICIPALITY.id } }),
    );
    expect(orders).toEqual([
      {
        id: 3,
        number: '2026-0003',
        issuedAt: NOW,
        settlementId: 11,
        period: 2023,
        cadastralCode: code('1'),
      },
    ]);
  });
});
