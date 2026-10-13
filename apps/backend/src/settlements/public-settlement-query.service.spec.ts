import { BadRequestException } from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PublicSettlementQueryService } from './public-settlement-query.service.js';

function buildPrisma(settlements: unknown[]) {
  return {
    settlement: { findMany: vi.fn().mockResolvedValue(settlements) },
    municipality: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) =>
        where.slug === 'paez'
          ? { id: MUNICIPALITY_ID, slug: 'paez', name: 'Páez' }
          : null,
      ),
    },
  };
}

// Decimal.toNumber() is the only Decimal method the service calls.
function decimal(value: number) {
  return { toNumber: () => value };
}

const MUNICIPALITY_ID = 3;

const ONE_SETTLEMENT = {
  id: 1,
  propertyId: 7,
  period: 2024,
  status: SettlementStatus.VIGENTE,
  replacedAt: null,
  resolution: { id: 9, number: '2026-0001', kind: 'NORMAL' },
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

    await expect(service.query(MUNICIPALITY_ID, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service.query(MUNICIPALITY_ID, { cadastralCode: '000100010001' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.query(MUNICIPALITY_ID, {
        cadastralCode: '  ',
        ownerName: '',
        address: undefined,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.settlement.findMany).not.toHaveBeenCalled();
  });

  it('accepts exactly 2 of 3 fields and matches them with equals, never contains', async () => {
    const prisma = buildPrisma([ONE_SETTLEMENT]);
    const service = new PublicSettlementQueryService(prisma as never);

    const result = await service.query(MUNICIPALITY_ID, {
      cadastralCode: '000100010001',
      address: 'Finca La Esperanza',
    });

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          replacedAt: null,
          property: {
            municipalityId: MUNICIPALITY_ID,
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
        resolutionNumber: '2026-0001',
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

    await service.query(MUNICIPALITY_ID, {
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

    await service.query(MUNICIPALITY_ID, {
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

    const result = await service.query(MUNICIPALITY_ID, {
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

  it('lists only issued resolutions: periods without one are not public', async () => {
    const rows = [
      ONE_SETTLEMENT,
      { ...ONE_SETTLEMENT, id: 2, period: 2025, resolution: null },
    ];
    const service = new PublicSettlementQueryService(
      buildPrisma(rows) as never,
    );

    const result = await service.query(MUNICIPALITY_ID, {
      cadastralCode: '000100010001',
      address: 'Finca La Esperanza',
    });

    expect(result).toEqual([
      expect.objectContaining({ settlementId: 1, periods: [2024] }),
    ]);
  });

  it('returns nothing when the given fields do not all match the same predio (RNF-04: no partial or suggested results)', async () => {
    // Simulates Prisma correctly finding no match for the AND-ed exact
    // criteria — the point under test is that the service returns exactly
    // what Prisma gives it, with no fallback/suggestion logic on top.
    const prisma = buildPrisma([]);
    const service = new PublicSettlementQueryService(prisma as never);

    const result = await service.query(MUNICIPALITY_ID, {
      cadastralCode: '000100010001',
      ownerName: 'Nombre Que No Coincide',
    });

    expect(result).toEqual([]);
  });

  it('pins every lookup to the municipality id, even when only one field is given a value that exists elsewhere', async () => {
    const prisma = buildPrisma([]);
    const service = new PublicSettlementQueryService(prisma as never);

    await service.query(99, { cadastralCode: '0001', address: 'X' });

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          property: expect.objectContaining({ municipalityId: 99 }),
        }),
      }),
    );
  });

  describe('queryBySlug', () => {
    it('resolves the slug and queries only that municipality', async () => {
      const prisma = buildPrisma([ONE_SETTLEMENT]);
      const service = new PublicSettlementQueryService(prisma as never);

      const result = await service.queryBySlug('paez', {
        cadastralCode: '000100010001',
        address: 'Finca La Esperanza',
      });

      expect(result).toHaveLength(1);
      expect(prisma.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            property: expect.objectContaining({
              municipalityId: MUNICIPALITY_ID,
            }),
          }),
        }),
      );
    });

    it('answers an unknown slug exactly like "no results": an empty list, without touching settlements', async () => {
      const prisma = buildPrisma([ONE_SETTLEMENT]);
      const service = new PublicSettlementQueryService(prisma as never);

      const result = await service.queryBySlug('no-existe', {
        cadastralCode: '000100010001',
        address: 'Finca La Esperanza',
      });

      expect(result).toEqual([]);
      expect(prisma.settlement.findMany).not.toHaveBeenCalled();
    });

    it('rejects too few fields the same way for a known and an unknown slug', async () => {
      const prisma = buildPrisma([]);
      const service = new PublicSettlementQueryService(prisma as never);

      for (const slug of ['paez', 'no-existe']) {
        await expect(
          service.queryBySlug(slug, { cadastralCode: '0001' }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });
  });
});
