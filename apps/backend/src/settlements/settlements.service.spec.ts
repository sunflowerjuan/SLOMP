import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SettlementsService } from './settlements.service.js';
import { ErrorCode } from '../common/errors/error-codes.js';

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
  missingSince: null as Date | null,
  totalAmount: decimal(1000),
  resolution,
  resolutionId: (resolution as { id?: number } | null)?.id ?? null,
  paymentOrder: null,
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

const MUNICIPALITY_ID = 5;

describe('SettlementsService', () => {
  it('rejects a search with no criteria at all', async () => {
    const prisma = buildPrisma([]);
    const service = new SettlementsService(prisma as never);

    await expect(service.search(MUNICIPALITY_ID, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.search(MUNICIPALITY_ID, {
        cadastralCode: '  ',
        owner: '',
        address: undefined,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.property.findMany).not.toHaveBeenCalled();
  });

  it('only searches properties with current settlements and returns one row per PDF (resolution)', async () => {
    const prisma = buildPrisma([ONE_PROPERTY]);
    const service = new SettlementsService(prisma as never);

    const result = await service.search(MUNICIPALITY_ID, {
      cadastralCode: '000100010001',
    });

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
      // can't go back to VIGENTE by hand once moved. In no payment order, so
      // PRESCRITA is allowed.
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
          SettlementStatus.PRESCRITA,
        ],
      }),
    ]);
  });

  it('returns the row indicators: kind of resolution and periods missing from the latest tax roll (SL-136)', async () => {
    const prisma = buildPrisma([
      {
        ...ONE_PROPERTY,
        settlements: [
          settlement(1, 2018),
          { ...settlement(2, 2019), missingSince: new Date() },
          settlement(3, 2025),
        ],
      },
    ]);
    const service = new SettlementsService(prisma as never);

    const result = await service.search(MUNICIPALITY_ID, { owner: 'Juan' });

    expect(result).toEqual([
      expect.objectContaining({
        kind: 'PRESCRIPTION_RISK',
        periods: [2018, 2019],
        missingPeriods: [2019],
      }),
      expect.objectContaining({
        kind: 'NORMAL',
        periods: [2025],
        missingPeriods: [],
      }),
    ]);
  });

  it('only applies a filter for the criteria that were actually given', async () => {
    const prisma = buildPrisma([]);
    const service = new SettlementsService(prisma as never);

    await service.search(MUNICIPALITY_ID, { owner: 'Juan' });

    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          municipalityId: MUNICIPALITY_ID,
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
    const ADMIN_ID = 42;

    function buildPrismaForStatusChange(
      current: unknown,
      groupMembers: {
        id: number;
        period: number;
        status?: SettlementStatus;
        missingSince?: Date | null;
      }[] = [],
    ) {
      const prisma = {
        settlement: {
          findFirst: vi.fn().mockResolvedValue(current),
          findMany: vi.fn().mockResolvedValue(
            groupMembers.map((member) => ({
              status: SettlementStatus.VIGENTE,
              missingSince: null,
              ...member,
            })),
          ),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        settlementEvent: { create: vi.fn().mockResolvedValue({}) },
        $transaction: vi.fn(async (run: (tx: unknown) => unknown) =>
          run(prisma),
        ),
      };
      return prisma;
    }

    const daysAgo = (days: number) =>
      new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const inResolution = (
      status: SettlementStatus,
      issuedDaysAgo: number,
      paymentOrderDaysAgo: number | null = null,
    ) => ({
      id: 1,
      replacedAt: null,
      resolutionId: 7,
      propertyId: 3,
      status,
      resolution: { issuedAt: daysAgo(issuedDaysAgo) },
      paymentOrder:
        paymentOrderDaysAgo === null
          ? null
          : { issuedAt: daysAgo(paymentOrderDaysAgo) },
    });

    it('rejects a status that is not a settlement state', async () => {
      const prisma = buildPrismaForStatusChange({ id: 1, replacedAt: null });
      const service = new SettlementsService(prisma as never);

      await expect(
        service.changeStatus(MUNICIPALITY_ID, ADMIN_ID, 1, 'ACTIVE'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.settlement.findFirst).not.toHaveBeenCalled();
    });

    it('rejects when the settlement does not exist', async () => {
      const prisma = buildPrismaForStatusChange(null);
      const service = new SettlementsService(prisma as never);

      await expect(
        service.changeStatus(
          MUNICIPALITY_ID,
          ADMIN_ID,
          1,
          SettlementStatus.PAGADA,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.settlement.updateMany).not.toHaveBeenCalled();
    });

    it('answers "not found" for a settlement of another municipality, without changing anything', async () => {
      // The scoped lookup finds nothing, exactly as for an id that does not exist.
      const prisma = buildPrismaForStatusChange(null);
      const service = new SettlementsService(prisma as never);

      await expect(
        service.changeStatus(
          MUNICIPALITY_ID,
          ADMIN_ID,
          99,
          SettlementStatus.PAGADA,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.settlement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 99, property: { municipalityId: MUNICIPALITY_ID } },
        }),
      );
      expect(prisma.settlement.updateMany).not.toHaveBeenCalled();
      expect(prisma.settlementEvent.create).not.toHaveBeenCalled();
    });

    it('rejects changing the status of an already-replaced settlement', async () => {
      const prisma = buildPrismaForStatusChange({
        id: 1,
        replacedAt: new Date(),
      });
      const service = new SettlementsService(prisma as never);

      await expect(
        service.changeStatus(
          MUNICIPALITY_ID,
          ADMIN_ID,
          1,
          SettlementStatus.PAGADA,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.settlement.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      SettlementStatus.PAGADA,
      SettlementStatus.ACUERDO_DE_PAGO,
      SettlementStatus.PRESCRITA,
    ])(
      'changes only that period (%s), never the rest of its resolution',
      async (status) => {
        const prisma = buildPrismaForStatusChange(
          inResolution(SettlementStatus.VIGENTE, 10),
          [
            { id: 1, period: 2020 },
            { id: 2, period: 2021 },
          ],
        );
        const service = new SettlementsService(prisma as never);

        const result = await service.changeStatus(
          MUNICIPALITY_ID,
          ADMIN_ID,
          1,
          status,
        );

        expect(prisma.settlement.updateMany).toHaveBeenCalledTimes(1);
        expect(prisma.settlement.updateMany).toHaveBeenCalledWith({
          where: { id: 1, status: SettlementStatus.VIGENTE, replacedAt: null },
          data: { status },
        });
        expect(result).toEqual({
          settlementId: 1,
          settlementIds: [1],
          status,
          allowedStatuses: expect.arrayContaining([status]),
          missingPeriods: [],
        });
      },
    );

    it('records the change as a MANUAL event with the administrator, in the same transaction', async () => {
      const prisma = buildPrismaForStatusChange(
        inResolution(SettlementStatus.EN_FIRME, 90),
        [{ id: 1, period: 2020 }],
      );
      const service = new SettlementsService(prisma as never);

      await service.changeStatus(
        MUNICIPALITY_ID,
        ADMIN_ID,
        1,
        SettlementStatus.PAGADA,
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.settlementEvent.create).toHaveBeenCalledWith({
        data: {
          settlementId: 1,
          municipalityId: MUNICIPALITY_ID,
          type: 'STATUS_CHANGED',
          fromStatus: SettlementStatus.EN_FIRME,
          toStatus: SettlementStatus.PAGADA,
          source: 'MANUAL',
          administratorId: ADMIN_ID,
        },
      });
    });

    it('re-sending the current state changes and records nothing', async () => {
      const prisma = buildPrismaForStatusChange(
        inResolution(SettlementStatus.PAGADA, 10),
        [{ id: 1, period: 2020 }],
      );
      const service = new SettlementsService(prisma as never);

      const result = await service.changeStatus(
        MUNICIPALITY_ID,
        ADMIN_ID,
        1,
        SettlementStatus.PAGADA,
      );

      expect(result.status).toBe(SettlementStatus.PAGADA);
      expect(prisma.settlement.updateMany).not.toHaveBeenCalled();
      expect(prisma.settlementEvent.create).not.toHaveBeenCalled();
    });

    it('rejects taking an EN_FIRME liquidation back to VIGENTE', async () => {
      const prisma = buildPrismaForStatusChange(
        inResolution(SettlementStatus.EN_FIRME, 90),
        [{ id: 1, period: 2020 }],
      );
      const service = new SettlementsService(prisma as never);

      const error = await service
        .changeStatus(MUNICIPALITY_ID, ADMIN_ID, 1, SettlementStatus.VIGENTE)
        .catch((caught: unknown) => caught);

      // The rules need the resolution's issue date and the settlement's own
      // payment order: the lookup must bring both.
      expect(prisma.settlement.findFirst).toHaveBeenCalledWith({
        where: { id: 1, property: { municipalityId: MUNICIPALITY_ID } },
        include: {
          resolution: { select: { issuedAt: true } },
          paymentOrder: { select: { issuedAt: true } },
        },
      });

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'SETTLEMENT_STATUS_TRANSITION_NOT_ALLOWED',
        details: { from: 'EN_FIRME', to: 'VIGENTE' },
      });
      expect(prisma.settlement.updateMany).not.toHaveBeenCalled();
    });

    it('answers 409, changing and recording nothing, when the status changed after it was read', async () => {
      const prisma = buildPrismaForStatusChange(
        inResolution(SettlementStatus.VIGENTE, 10),
        [{ id: 1, period: 2020 }],
      );
      // Another tab (or the EN_FIRME sweep) already moved it out of VIGENTE.
      prisma.settlement.updateMany.mockResolvedValueOnce({ count: 0 });
      const service = new SettlementsService(prisma as never);

      const error = await service
        .changeStatus(MUNICIPALITY_ID, ADMIN_ID, 1, SettlementStatus.PAGADA)
        .catch((e) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getResponse()).toMatchObject({
        code: ErrorCode.SETTLEMENT_STATUS_CHANGED,
      });
      expect(prisma.settlementEvent.create).not.toHaveBeenCalled();
    });

    describe('PRESCRITA from EN_FIRME', () => {
      it('is allowed when the settlement is in no payment order', async () => {
        const prisma = buildPrismaForStatusChange(
          inResolution(SettlementStatus.EN_FIRME, 90),
          [{ id: 1, period: 2020 }],
        );
        await new SettlementsService(prisma as never).changeStatus(
          MUNICIPALITY_ID,
          ADMIN_ID,
          1,
          SettlementStatus.PRESCRITA,
        );
        expect(prisma.settlement.updateMany).toHaveBeenCalled();
      });

      it('is rejected while its own payment order is younger than 5 years', async () => {
        const prisma = buildPrismaForStatusChange(
          inResolution(SettlementStatus.EN_FIRME, 900, 4 * 365),
          [{ id: 1, period: 2020 }],
        );
        await expect(
          new SettlementsService(prisma as never).changeStatus(
            MUNICIPALITY_ID,
            ADMIN_ID,
            1,
            SettlementStatus.PRESCRITA,
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(prisma.settlement.updateMany).not.toHaveBeenCalled();
      });

      it('is allowed once its own payment order is 5 years old', async () => {
        const prisma = buildPrismaForStatusChange(
          inResolution(SettlementStatus.EN_FIRME, 3000, 6 * 366),
          [{ id: 1, period: 2020 }],
        );
        await new SettlementsService(prisma as never).changeStatus(
          MUNICIPALITY_ID,
          ADMIN_ID,
          1,
          SettlementStatus.PRESCRITA,
        );
        expect(prisma.settlement.updateMany).toHaveBeenCalled();
      });
    });

    it('returns a paid liquidation to EN_FIRME once 60 days have passed', async () => {
      const prisma = buildPrismaForStatusChange(
        inResolution(SettlementStatus.PAGADA, 90, 30),
        [{ id: 1, period: 2020 }],
      );
      const service = new SettlementsService(prisma as never);

      await expect(
        service.changeStatus(
          MUNICIPALITY_ID,
          ADMIN_ID,
          1,
          SettlementStatus.VIGENTE,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      const result = await service.changeStatus(
        MUNICIPALITY_ID,
        ADMIN_ID,
        1,
        SettlementStatus.EN_FIRME,
      );
      expect(result.allowedStatuses).toEqual([
        SettlementStatus.EN_FIRME,
        SettlementStatus.PAGADA,
        SettlementStatus.ACUERDO_DE_PAGO,
      ]);
    });

    it('reports the periods of the group still missing from the latest tax roll', async () => {
      // Periods 2000/2001 are always at prescription risk; 2999 never is.
      const prisma = buildPrismaForStatusChange(
        {
          id: 1,
          replacedAt: null,
          resolutionId: null,
          propertyId: 3,
          status: SettlementStatus.VIGENTE,
          resolution: null,
          paymentOrder: null,
        },
        [
          { id: 1, period: 2000 },
          { id: 2, period: 2001, missingSince: new Date() },
          { id: 3, period: 2999, missingSince: new Date() },
        ],
      );
      const service = new SettlementsService(prisma as never);

      const result = await service.changeStatus(
        MUNICIPALITY_ID,
        ADMIN_ID,
        1,
        SettlementStatus.PAGADA,
      );

      expect(result.settlementIds).toEqual([1]);
      expect(result.missingPeriods).toEqual([2001]);
    });
  });
});

describe('SettlementStatus', () => {
  it('has exactly the five real settlement lifecycle states', () => {
    expect(
      Object.values(SettlementStatus).sort((a, b) => a.localeCompare(b)),
    ).toEqual(
      [
        SettlementStatus.VIGENTE,
        SettlementStatus.EN_FIRME,
        SettlementStatus.PAGADA,
        SettlementStatus.ACUERDO_DE_PAGO,
        SettlementStatus.PRESCRITA,
      ].sort((a, b) => a.localeCompare(b)),
    );
  });
});
