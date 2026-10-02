import { BadRequestException } from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PublicSettlementQueryService } from './public-settlement-query.service.js';

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
    owners: [{ owner: { name: 'Juan Pérez' } }],
  },
};

describe('PublicSettlementQueryService', () => {
  it('rejects a query with fewer than 2 fields', async () => {
    const prisma = buildPrisma([]);
    const service = new PublicSettlementQueryService(prisma as never);

    await expect(service.query({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.query({ cadastralCode: '000100010001' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.query({ cadastralCode: '  ', ownerName: '', address: undefined }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.settlement.findMany).not.toHaveBeenCalled();
  });

  it('accepts exactly 2 of 3 fields and matches them with equals, never contains', async () => {
    const prisma = buildPrisma([ONE_SETTLEMENT]);
    const service = new PublicSettlementQueryService(prisma as never);

    const result = await service.query({
      cadastralCode: '000100010001',
      address: 'Finca La Esperanza',
    });

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          replacedAt: null,
          property: {
            cadastralCode: { equals: '000100010001', mode: 'insensitive' },
            address: { equals: 'Finca La Esperanza', mode: 'insensitive' },
          },
        }),
      }),
    );
    expect(result).toEqual([
      {
        settlementId: 1,
        cadastralCode: '000100010001',
        address: 'Finca La Esperanza',
        ownerName: 'Juan Pérez',
        period: 2024,
        status: SettlementStatus.VIGENTE,
        totalAmount: 54590,
      },
    ]);
  });

  it('accepts all 3 fields, AND-ing them together', async () => {
    const prisma = buildPrisma([]);
    const service = new PublicSettlementQueryService(prisma as never);

    await service.query({
      cadastralCode: '000100010001',
      address: 'Finca La Esperanza',
      ownerName: 'Juan Pérez',
    });

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          property: expect.objectContaining({
            cadastralCode: { equals: '000100010001', mode: 'insensitive' },
            address: { equals: 'Finca La Esperanza', mode: 'insensitive' },
            owners: {
              some: {
                owner: { name: { equals: 'Juan Pérez', mode: 'insensitive' } },
              },
            },
          }),
        }),
      }),
    );
  });

  it('only returns the current (non-replaced) settlement, one row per period, regardless of payment status', async () => {
    const otherPeriod = {
      ...ONE_SETTLEMENT,
      id: 2,
      period: 2025,
      status: SettlementStatus.PAGADA,
    };
    const prisma = buildPrisma([ONE_SETTLEMENT, otherPeriod]);
    const service = new PublicSettlementQueryService(prisma as never);

    const result = await service.query({
      cadastralCode: '000100010001',
      address: 'Finca La Esperanza',
    });

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ replacedAt: null }),
        orderBy: { period: 'asc' },
      }),
    );
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.period)).toEqual([2024, 2025]);
    expect(result.map((r) => r.status)).toEqual([
      SettlementStatus.VIGENTE,
      SettlementStatus.PAGADA,
    ]);
  });

  it('returns nothing when the given fields do not all match the same predio (RNF-04: no partial or suggested results)', async () => {
    // Simulates Prisma correctly finding no match for the AND-ed exact
    // criteria — the point under test is that the service returns exactly
    // what Prisma gives it, with no fallback/suggestion logic on top.
    const prisma = buildPrisma([]);
    const service = new PublicSettlementQueryService(prisma as never);

    const result = await service.query({
      cadastralCode: '000100010001',
      ownerName: 'Nombre Que No Coincide',
    });

    expect(result).toEqual([]);
  });
});
