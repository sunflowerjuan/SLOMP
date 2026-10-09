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
  propertyId: 7,
  period: 2024,
  status: SettlementStatus.VIGENTE,
  replacedAt: null,
  resolution: null,
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
      expect.objectContaining({
        settlementId: 1,
        cadastralCode: '000100010001',
        address: 'Finca La Esperanza',
        ownerName: 'Juan Pérez',
        resolutionNumber: null,
        periods: [2024],
        status: SettlementStatus.VIGENTE,
        totalAmount: 54590,
      }),
    ]);
    expect(result[0]).not.toHaveProperty('issuedAt');
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

  it('only asks for the current (non-replaced) settlements, regardless of payment status', async () => {
    const prisma = buildPrisma([]);
    const service = new PublicSettlementQueryService(prisma as never);

    await service.query({
      cadastralCode: '000100010001',
      address: 'Finca La Esperanza',
    });

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ replacedAt: null }),
        orderBy: { period: 'asc' },
      }),
    );
  });

  it('groups the periods of one Resolution into a single row, and keeps another Resolution apart', async () => {
    const resolutionA = { id: 10, number: '001-2026', kind: 'NORMAL' };
    const resolutionB = { id: 11, number: '002-2026', kind: 'NORMAL' };
    const rows = [
      { ...ONE_SETTLEMENT, id: 1, period: 2024, resolution: resolutionA },
      {
        ...ONE_SETTLEMENT,
        id: 2,
        period: 2025,
        status: SettlementStatus.PAGADA,
        totalAmount: decimal(1000),
        resolution: resolutionA,
      },
      { ...ONE_SETTLEMENT, id: 3, period: 2026, resolution: resolutionB },
    ];
    const prisma = buildPrisma(rows);
    const service = new PublicSettlementQueryService(prisma as never);

    const result = await service.query({
      cadastralCode: '000100010001',
      address: 'Finca La Esperanza',
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      settlementId: 1,
      resolutionNumber: '001-2026',
      periods: [2024, 2025],
      status: 'MIXED',
      totalAmount: 55590,
    });
    expect(result[1]).toMatchObject({
      settlementId: 3,
      resolutionNumber: '002-2026',
      periods: [2026],
    });
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
