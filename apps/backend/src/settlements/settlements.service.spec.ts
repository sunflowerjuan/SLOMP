import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SettlementsService } from './settlements.service.js';

function buildPrisma(properties: unknown[]) {
  return { property: { findMany: vi.fn().mockResolvedValue(properties) } };
}

// Decimal.toNumber() is the only Decimal method the service calls.
function decimal(value: number) {
  return { toNumber: () => value };
}

const settlement = (
  id: number,
  period: number,
  resolution: unknown = null,
) => ({
  id,
  period,
  status: SettlementStatus.VIGENTE,
  replacedAt: null,
  totalAmount: decimal(1000),
  resolution,
  resolutionId: (resolution as { id?: number } | null)?.id ?? null,
  paymentOrders: [],
});

const ONE_PROPERTY = {
  cadastralCode: '000100010001',
  address: 'Finca La Esperanza',
  owners: [
    { owner: { name: 'Juan Pérez' } },
    { owner: { name: 'María Gómez' } },
  ],
  settlements: [
    settlement(1, 2018),
    settlement(2, 2019),
    settlement(3, 2025, {
      id: 7,
      number: 'LOIP 15514 2026-0007',
      kind: 'NORMAL',
      issuedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    }),
  ],
};

describe('SettlementsService', () => {
  it('rejects a search with no criteria at all', async () => {
    const prisma = buildPrisma([]);
    const service = new SettlementsService(prisma as never);

    await expect(service.search({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.search({ cadastralCode: '  ', owner: '', address: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.property.findMany).not.toHaveBeenCalled();
  });

  it('only searches properties with current settlements and returns one row per PDF (resolution)', async () => {
    const prisma = buildPrisma([ONE_PROPERTY]);
    const service = new SettlementsService(prisma as never);

    const result = await service.search({ cadastralCode: '000100010001' });

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          settlements: { some: { replacedAt: null } },
        }),
        include: expect.objectContaining({
          settlements: expect.objectContaining({
            where: { replacedAt: null },
          }),
        }),
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        settlementId: 1,
        cadastralCode: '000100010001',
        address: 'Finca La Esperanza',
        ownerName: 'Juan Pérez, María Gómez',
        resolutionNumber: null,
        kind: 'PRESCRIPTION_RISK',
        periods: [2018, 2019],
        status: SettlementStatus.VIGENTE,
        totalAmount: 2000,
        allowedStatuses: [
          SettlementStatus.VIGENTE,
          SettlementStatus.PAGADA,
          SettlementStatus.ACUERDO_DE_PAGO,
          SettlementStatus.PRESCRITA,
        ],
      }),
      // Resolution issued 90 days ago: VIGENTE until the sweep runs, but it
      // can only move to EN_FIRME, PAGADA or ACUERDO_DE_PAGO.
      expect.objectContaining({
        settlementId: 3,
        resolutionNumber: 'LOIP 15514 2026-0007',
        periods: [2025],
        totalAmount: 1000,
        allowedStatuses: [
          SettlementStatus.VIGENTE,
          SettlementStatus.EN_FIRME,
          SettlementStatus.PAGADA,
          SettlementStatus.ACUERDO_DE_PAGO,
        ],
      }),
    ]);
  });

  it('only applies a filter for the criteria that were actually given', async () => {
    const prisma = buildPrisma([]);
    const service = new SettlementsService(prisma as never);

    await service.search({ owner: 'Juan' });

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          settlements: { some: { replacedAt: null } },
          owners: {
            some: {
              owner: { name: { contains: 'Juan', mode: 'insensitive' } },
            },
          },
        },
      }),
    );
  });

  describe('changeStatus', () => {
    function buildPrismaForStatusChange(
      current: unknown,
      siblings: { id: number; period?: number }[] = [],
      firstPaymentOrder: { issuedAt: Date } | null = null,
    ) {
      return {
        settlement: {
          findUnique: vi.fn().mockResolvedValue(current),
          findMany: vi.fn().mockResolvedValue(siblings),
          updateMany: vi.fn().mockResolvedValue({ count: siblings.length }),
        },
        paymentOrder: {
          findFirst: vi.fn().mockResolvedValue(firstPaymentOrder),
        },
      };
    }

    const daysAgo = (days: number) =>
      new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const inResolution = (status: SettlementStatus, issuedDaysAgo: number) => ({
      id: 1,
      replacedAt: null,
      resolutionId: 7,
      propertyId: 3,
      status,
      resolution: { issuedAt: daysAgo(issuedDaysAgo) },
    });

    it('rejects a status that is not a settlement state', async () => {
      const prisma = buildPrismaForStatusChange({ id: 1, replacedAt: null });
      const service = new SettlementsService(prisma as never);

      await expect(service.changeStatus(1, 'ACTIVE')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.settlement.findUnique).not.toHaveBeenCalled();
    });

    it('rejects when the settlement does not exist', async () => {
      const prisma = buildPrismaForStatusChange(null);
      const service = new SettlementsService(prisma as never);

      await expect(
        service.changeStatus(1, SettlementStatus.PAGADA),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.settlement.updateMany).not.toHaveBeenCalled();
    });

    it('rejects changing the status of an already-replaced settlement', async () => {
      const prisma = buildPrismaForStatusChange({
        id: 1,
        replacedAt: new Date(),
      });
      const service = new SettlementsService(prisma as never);

      await expect(
        service.changeStatus(1, SettlementStatus.PAGADA),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.settlement.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      SettlementStatus.PAGADA,
      SettlementStatus.ACUERDO_DE_PAGO,
      SettlementStatus.PRESCRITA,
    ])(
      'applies an allowed change (%s) to every settlement of a generated resolution',
      async (status) => {
        const prisma = buildPrismaForStatusChange(
          inResolution(SettlementStatus.VIGENTE, 10),
          [{ id: 1 }, { id: 2 }],
        );
        const service = new SettlementsService(prisma as never);

        const result = await service.changeStatus(1, status);

        expect(prisma.settlement.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { resolutionId: 7, replacedAt: null },
          }),
        );
        expect(prisma.settlement.updateMany).toHaveBeenCalledWith({
          where: { id: { in: [1, 2] } },
          data: { status },
        });
        expect(result).toEqual({
          settlementId: 1,
          settlementIds: [1, 2],
          status,
          allowedStatuses: expect.arrayContaining([status]),
        });
      },
    );

    it('rejects taking an EN_FIRME liquidation back to VIGENTE', async () => {
      const prisma = buildPrismaForStatusChange(
        inResolution(SettlementStatus.EN_FIRME, 90),
        [{ id: 1 }],
      );
      const service = new SettlementsService(prisma as never);

      const error = await service
        .changeStatus(1, SettlementStatus.VIGENTE)
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'SETTLEMENT_STATUS_TRANSITION_NOT_ALLOWED',
        details: { from: 'EN_FIRME', to: 'VIGENTE' },
      });
      expect(prisma.settlement.updateMany).not.toHaveBeenCalled();
    });

    it('only allows PRESCRITA from EN_FIRME once the payment order is 5 years old', async () => {
      const blocked = buildPrismaForStatusChange(
        inResolution(SettlementStatus.EN_FIRME, 90),
        [{ id: 1 }],
      );
      await expect(
        new SettlementsService(blocked as never).changeStatus(
          1,
          SettlementStatus.PRESCRITA,
        ),
      ).rejects.toBeInstanceOf(ConflictException);

      const allowed = buildPrismaForStatusChange(
        inResolution(SettlementStatus.EN_FIRME, 3000),
        [{ id: 1 }],
        { issuedAt: daysAgo(6 * 366) },
      );
      await new SettlementsService(allowed as never).changeStatus(
        1,
        SettlementStatus.PRESCRITA,
      );
      expect(allowed.paymentOrder.findFirst).toHaveBeenCalledWith({
        where: { settlementId: { in: [1] } },
        orderBy: { issuedAt: 'asc' },
        select: { issuedAt: true },
      });
      expect(allowed.settlement.updateMany).toHaveBeenCalled();
    });

    it('returns a paid liquidation to EN_FIRME once 60 days have passed', async () => {
      const prisma = buildPrismaForStatusChange(
        inResolution(SettlementStatus.PAGADA, 90),
        [{ id: 1 }],
      );
      const service = new SettlementsService(prisma as never);

      await expect(
        service.changeStatus(1, SettlementStatus.VIGENTE),
      ).rejects.toBeInstanceOf(ConflictException);
      const result = await service.changeStatus(1, SettlementStatus.EN_FIRME);
      expect(result.allowedStatuses).toEqual([
        SettlementStatus.EN_FIRME,
        SettlementStatus.PAGADA,
        SettlementStatus.ACUERDO_DE_PAGO,
      ]);
      expect(prisma.settlement.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1] } },
        data: { status: SettlementStatus.EN_FIRME },
      });
    });

    it('before a resolution exists, changes only the same-kind periods of that property', async () => {
      // Periods 2000/2001 are always at prescription risk; 2999 never is.
      const prisma = buildPrismaForStatusChange(
        {
          id: 1,
          replacedAt: null,
          resolutionId: null,
          propertyId: 3,
          status: SettlementStatus.VIGENTE,
          resolution: null,
        },
        [
          { id: 1, period: 2000 },
          { id: 2, period: 2001 },
          { id: 3, period: 2999 },
        ],
      );
      const service = new SettlementsService(prisma as never);

      const result = await service.changeStatus(1, SettlementStatus.PAGADA);

      expect(result.settlementIds).toEqual([1, 2]);
      expect(prisma.settlement.updateMany).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
        data: { status: SettlementStatus.PAGADA },
      });
    });
  });
});

describe('SettlementStatus', () => {
  it('has exactly the five real settlement lifecycle states', () => {
    expect(Object.values(SettlementStatus).sort()).toEqual(
      [
        SettlementStatus.VIGENTE,
        SettlementStatus.EN_FIRME,
        SettlementStatus.PAGADA,
        SettlementStatus.ACUERDO_DE_PAGO,
        SettlementStatus.PRESCRITA,
      ].sort(),
    );
  });
});
