import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { SettlementsService } from './settlements.service.js';

function buildPrisma(settlements: unknown[]) {
  return { settlement: { findMany: vi.fn().mockResolvedValue(settlements) } };
}

// Decimal.toNumber() is the only Decimal method the service calls.
function decimal(value: number) {
  return { toNumber: () => value };
}

const ONE_SETTLEMENT = {
  id: 1,
  period: 2024,
  status: SettlementStatus.VIGENTE,
  replacedAt: null,
  totalAmount: decimal(54590),
  property: {
    cadastralCode: '000100010001',
    address: 'Finca La Esperanza',
    owners: [
      { owner: { name: 'Juan Pérez' } },
      { owner: { name: 'María Gómez' } },
    ],
  },
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
    expect(prisma.settlement.findMany).not.toHaveBeenCalled();
  });

  it('only searches current (non-replaced) settlements, and shapes the result for the panel', async () => {
    const prisma = buildPrisma([ONE_SETTLEMENT]);
    const service = new SettlementsService(prisma as never);

    const result = await service.search({ cadastralCode: '000100010001' });

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ replacedAt: null }),
      }),
    );
    expect(result).toEqual([
      {
        settlementId: 1,
        cadastralCode: '000100010001',
        address: 'Finca La Esperanza',
        ownerName: 'Juan Pérez, María Gómez',
        period: 2024,
        status: SettlementStatus.VIGENTE,
        totalAmount: 54590,
      },
    ]);
  });

  it('only applies a filter for the criteria that were actually given', async () => {
    const prisma = buildPrisma([]);
    const service = new SettlementsService(prisma as never);

    await service.search({ owner: 'Juan' });

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          property: {
            owners: {
              some: {
                owner: { name: { contains: 'Juan', mode: 'insensitive' } },
              },
            },
          },
        }),
      }),
    );
  });

  describe('changeStatus', () => {
    function buildPrismaForStatusChange(settlement: unknown) {
      return {
        settlement: {
          findUnique: vi.fn().mockResolvedValue(settlement),
          update: vi
            .fn()
            .mockImplementation(
              async ({ data }: { data: { status: SettlementStatus } }) => ({
                id: 1,
                status: data.status,
              }),
            ),
        },
      };
    }

    it('rejects a status that is not one of the 4 ERS states', async () => {
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
      expect(prisma.settlement.update).not.toHaveBeenCalled();
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
      expect(prisma.settlement.update).not.toHaveBeenCalled();
    });

    it('lets the Administrator force any of the 4 states on a current settlement', async () => {
      const prisma = buildPrismaForStatusChange({ id: 1, replacedAt: null });
      const service = new SettlementsService(prisma as never);

      const result = await service.changeStatus(
        1,
        SettlementStatus.ACUERDO_DE_PAGO,
      );

      expect(prisma.settlement.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: SettlementStatus.ACUERDO_DE_PAGO },
      });
      expect(result).toEqual({
        settlementId: 1,
        status: SettlementStatus.ACUERDO_DE_PAGO,
      });
    });
  });
});
