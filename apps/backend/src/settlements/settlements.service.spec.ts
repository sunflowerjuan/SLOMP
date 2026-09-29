import { BadRequestException } from '@nestjs/common';
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
  period: '2024',
  status: SettlementStatus.ACTIVE,
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

  it('only searches ACTIVE settlements, and shapes the result for the panel', async () => {
    const prisma = buildPrisma([ONE_SETTLEMENT]);
    const service = new SettlementsService(prisma as never);

    const result = await service.search({ cadastralCode: '000100010001' });

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: SettlementStatus.ACTIVE }),
      }),
    );
    expect(result).toEqual([
      {
        settlementId: 1,
        cadastralCode: '000100010001',
        address: 'Finca La Esperanza',
        ownerName: 'Juan Pérez, María Gómez',
        period: '2024',
        status: SettlementStatus.ACTIVE,
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
});
