import { BadRequestException, ConflictException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { AssistantToolsService } from '../assistant/assistant-tools.service.js';
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
  propertyId?: number;
  resolution?: { number: string; issuedAt: Date } | null;
  hasPaymentOrder?: boolean;
}

const toRow = (s: FakeSettlement) => ({
  id: s.id,
  // code('1') is property 1, code('2') property 2...
  propertyId: s.propertyId ?? Number(s.cadastralCode.slice(5, 6)),
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
    // The linked count: one row per settlement id given.
    $executeRaw: vi.fn(
      async (_query: unknown, ...values: unknown[]) =>
        (values[0] as number[]).length,
    ),
    $queryRaw: vi.fn(async () => [{ lastSequence: 0 }]),
    pdfJob: { count: vi.fn(async () => 0) },
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
        async ({ data }: { data: { number: string }[] }) =>
          data.map((d, i) => ({
            id: 100 + i,
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
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );
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
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

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
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

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

  it('lists the current periods of each property in the file that the file leaves out, with no personal data', async () => {
    const { prisma } = buildPrisma([
      { id: 1, period: 2019, cadastralCode: code('1') },
      { id: 2, period: 2020, cadastralCode: code('1') },
      { id: 3, period: 2021, cadastralCode: code('1'), status: 'PAGADA' },
      { id: 4, period: 2020, cadastralCode: code('2') },
    ]);
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

    const preview = await service.previewImport(
      MUNICIPALITY,
      await workbookWith([
        { cadastralCode: code('1'), period: 2019 },
        { cadastralCode: code('2'), period: 2020 },
      ]),
      'x.xlsx',
      NOW,
    );

    expect(preview.unlisted).toEqual([
      {
        id: 2,
        cadastralCode: code('1'),
        period: 2020,
        status: 'VIGENTE',
        allowedStatuses: expect.any(Array),
        hasPaymentOrder: false,
      },
      {
        id: 3,
        cadastralCode: code('1'),
        period: 2021,
        status: 'PAGADA',
        allowedStatuses: expect.any(Array),
        hasPaymentOrder: false,
      },
    ]);
    for (const settlement of preview.unlisted) {
      expect(Object.keys(settlement).sort()).toEqual([
        'allowedStatuses',
        'cadastralCode',
        'hasPaymentOrder',
        'id',
        'period',
        'status',
      ]);
    }
  });

  it('reports a property+period listed twice only once', async () => {
    const { prisma } = buildPrisma([
      { id: 1, period: 2023, cadastralCode: code('1') },
    ]);
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

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
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

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
      const service = new PaymentOrdersService(
        prisma as never,
        new AssistantToolsService(prisma as never),
      );
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
      const service = new PaymentOrdersService(
        prisma as never,
        new AssistantToolsService(prisma as never),
      );

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
      const service = new PaymentOrdersService(
        prisma as never,
        new AssistantToolsService(prisma as never),
      );
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
      const service = new PaymentOrdersService(
        prisma as never,
        new AssistantToolsService(prisma as never),
      );

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
  it('generates one payment order for a firm settlement, numbered and dated now', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2023, cadastralCode: code('1') },
    ]);
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

    const result = await service.generate(MUNICIPALITY.id, 9, [1], NOW);

    expect(result.rejected).toEqual([]);
    expect(result.created).toEqual([
      {
        paymentOrderId: 100,
        number: '2026-0001',
        issuedAt: NOW,
        propertyId: 1,
        settlementIds: [1],
      },
    ]);
    expect(tx.paymentOrder.createManyAndReturn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          {
            municipalityId: MUNICIPALITY.id,
            propertyId: 1,
            administratorId: 9,
            number: '2026-0001',
            year: 2026,
            sequence: 1,
            issuedAt: NOW,
            pdfJobId: undefined,
          },
        ],
      }),
    );
  });

  it('puts all the eligible periods of a property in one payment order and gives each other property its own number', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2021, cadastralCode: code('1') },
      { id: 2, period: 2022, cadastralCode: code('1') },
      { id: 3, period: 2023, cadastralCode: code('1') },
      { id: 4, period: 2022, cadastralCode: code('2') },
    ]);
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

    const result = await service.generate(
      MUNICIPALITY.id,
      9,
      [4, 3, 2, 1],
      NOW,
    );

    expect(
      result.created.map((c) => [c.number, c.propertyId, c.settlementIds]),
    ).toEqual([
      ['2026-0001', 1, [1, 2, 3]],
      ['2026-0002', 2, [4]],
    ]);
    // Each period is linked to the order of its property, in one statement
    // (the call before it is the counter lock).
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    const [, settlementIds, orderIds] = tx.$executeRaw.mock.calls.at(-1)!;
    expect(settlementIds).toEqual([1, 2, 3, 4]);
    expect(orderIds).toEqual([100, 100, 100, 101]);
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
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

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
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

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
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

    const result = await service.generate(
      MUNICIPALITY.id,
      9,
      [1, 2, 3, 4, 99],
      NOW,
    );

    expect(result.created.map((c) => [c.number, c.settlementIds])).toEqual([
      ['2026-0001', [1, 3]],
    ]);
    expect(result.rejected.map((r) => [r.settlementId, r.reason])).toEqual([
      [2, 'STATUS_NOT_ELIGIBLE'],
      [4, 'ALREADY_HAS_PAYMENT_ORDER'],
      [99, 'SETTLEMENT_NOT_FOUND'],
    ]);
  });

  it('reserves the numbers of all the properties in one block, inside the same transaction as the orders', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2022, cadastralCode: code('1') },
      { id: 2, period: 2023, cadastralCode: code('2') },
      { id: 3, period: 2024, cadastralCode: code('3') },
    ]);
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

    await service.generate(MUNICIPALITY.id, 9, [1, 2, 3], NOW);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.paymentOrderCounter.upsert).toHaveBeenCalledTimes(1);
    expect(tx.paymentOrderCounter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          municipalityId_year: { municipalityId: MUNICIPALITY.id, year: 2026 },
        },
        update: { lastSequence: { increment: 3 } },
      }),
    );
  });

  it('counts the year in Colombia: late on Dec 31 is still that year', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2022, cadastralCode: code('1') },
    ]);
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );
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
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

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
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

    const result = await service.generate(MUNICIPALITY.id, 9, [1, 1, 1], NOW);

    expect(result.created).toHaveLength(1);
    expect(tx.paymentOrder.createManyAndReturn).toHaveBeenCalledTimes(1);
  });

  it('answers 409 when another request claimed one of the periods first, and the transaction aborts', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2022, cadastralCode: code('1') },
      { id: 2, period: 2023, cadastralCode: code('1') },
    ]);
    // The guarded UPDATE links one row less than asked.
    tx.$executeRaw.mockResolvedValue(1);
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

    const error = await service
      .generate(MUNICIPALITY.id, 9, [1, 2], NOW)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse().code).toBe(
      ErrorCode.PAYMENT_ORDER_CONCURRENT_GENERATION,
    );
  });

  it('answers 409 and reserves nothing while a bulk job is running for the municipality', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2022, cadastralCode: code('1') },
    ]);
    tx.pdfJob.count.mockResolvedValue(1);
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

    const error = await service
      .generate(MUNICIPALITY.id, 9, [1], NOW)
      .catch((e) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse().code).toBe(
      ErrorCode.BULK_GENERATION_IN_PROGRESS,
    );
    expect(tx.paymentOrderCounter.upsert).not.toHaveBeenCalled();
    expect(tx.paymentOrder.createManyAndReturn).not.toHaveBeenCalled();
  });

  it('lets any other error through', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 1, period: 2022, cadastralCode: code('1') },
    ]);
    tx.paymentOrder.createManyAndReturn.mockRejectedValue(new Error('boom'));
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

    await expect(
      service.generate(MUNICIPALITY.id, 9, [1], NOW),
    ).rejects.toThrow('boom');
  });
});

describe('PaymentOrdersService.list', () => {
  it('lists only the payment orders of the municipality, with the periods each covers', async () => {
    const { prisma } = buildPrisma();
    prisma.paymentOrder.findMany.mockResolvedValue([
      {
        id: 3,
        number: '2026-0003',
        issuedAt: NOW,
        property: { cadastralCode: code('1') },
        settlements: [
          { id: 12, period: 2023 },
          { id: 11, period: 2021 },
        ],
      },
    ]);
    const service = new PaymentOrdersService(
      prisma as never,
      new AssistantToolsService(prisma as never),
    );

    const orders = await service.list(MUNICIPALITY.id);

    expect(prisma.paymentOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { municipalityId: MUNICIPALITY.id } }),
    );
    expect(orders).toEqual([
      {
        id: 3,
        number: '2026-0003',
        issuedAt: NOW,
        cadastralCode: code('1'),
        settlementIds: [12, 11],
        periods: [2021, 2023],
      },
    ]);
  });
});
