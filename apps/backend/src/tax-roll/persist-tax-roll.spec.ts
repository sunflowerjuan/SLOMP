import { SettlementStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { TaxRollRowDto } from './tax-roll-row.dto.js';
import { persistTaxRoll } from './persist-tax-roll.js';

type FakeProperty = {
  id: number;
  cadastralCode: string;
  address: string;
  landUse: string | null;
  appraisalValue: number;
};

type FakeOwner = { id: number; documentId: string; name: string };

type FakePropertyOwner = {
  propertyId: number;
  ownerId: number;
  percentage: number;
};

type FakeSettlement = {
  id: number;
  propertyId: number;
  period: string;
  totalAmount: number;
  status: SettlementStatus;
};

type FakeSettlementDetail = {
  id: number;
  settlementId: number;
  concept: string;
  amount: number;
};

// Minimal in-memory stand-in for PrismaService, covering only the calls
// persistTaxRoll actually makes.
class FakePrisma {
  private nextId = 1;
  municipalities: { id: number }[] = [{ id: 1 }];
  properties: FakeProperty[] = [];
  owners: FakeOwner[] = [];
  propertyOwners: FakePropertyOwner[] = [];
  settlements: FakeSettlement[] = [];
  settlementDetails: FakeSettlementDetail[] = [];

  municipality = { findFirst: async () => this.municipalities[0] ?? null };

  property = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { cadastralCode: string };
      create: Omit<FakeProperty, 'id'>;
      update: Partial<FakeProperty>;
    }) => {
      const existing = this.properties.find(
        (p) => p.cadastralCode === where.cadastralCode,
      );
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const created = { id: this.nextId++, ...create };
      this.properties.push(created);
      return created;
    },
    findMany: async ({
      where,
    }: {
      where: { cadastralCode: { in: string[] } };
    }) =>
      this.properties.filter((p) =>
        where.cadastralCode.in.includes(p.cadastralCode),
      ),
  };

  owner = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { documentId: string };
      create: Omit<FakeOwner, 'id'>;
      update: Partial<FakeOwner>;
    }) => {
      const existing = this.owners.find(
        (o) => o.documentId === where.documentId,
      );
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const created = { id: this.nextId++, ...create };
      this.owners.push(created);
      return created;
    },
    findMany: async ({ where }: { where: { documentId: { in: string[] } } }) =>
      this.owners.filter((o) => where.documentId.in.includes(o.documentId)),
  };

  propertyOwner = {
    createMany: async ({
      data,
    }: {
      data: FakePropertyOwner[];
      skipDuplicates?: boolean;
    }) => {
      for (const link of data) {
        const exists = this.propertyOwners.some(
          (po) =>
            po.propertyId === link.propertyId && po.ownerId === link.ownerId,
        );
        if (!exists) this.propertyOwners.push(link);
      }
    },
  };

  settlement = {
    findMany: async ({
      where,
    }: {
      where: { propertyId: { in: number[] }; status?: SettlementStatus };
    }) =>
      this.settlements.filter(
        (s) =>
          where.propertyId.in.includes(s.propertyId) &&
          (where.status === undefined || s.status === where.status),
      ),
    createManyAndReturn: async ({
      data,
    }: {
      data: Omit<FakeSettlement, 'id'>[];
    }) => {
      const created = data.map((d) => ({ id: this.nextId++, ...d }));
      this.settlements.push(...created);
      return created;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: { in: number[] } };
      data: Partial<FakeSettlement>;
    }) => {
      for (const s of this.settlements) {
        if (where.id.in.includes(s.id)) Object.assign(s, data);
      }
    },
  };

  settlementDetail = {
    createMany: async ({
      data,
    }: {
      data: Omit<FakeSettlementDetail, 'id'>[];
    }) => {
      this.settlementDetails.push(
        ...data.map((d) => ({ id: this.nextId++, ...d })),
      );
    },
  };
}

function buildRow(overrides: Partial<TaxRollRowDto> = {}): TaxRollRowDto {
  return {
    cadastralCode: '000100010001',
    landUse: 'rural',
    appraisalValue: 1000000,
    taxId: '00123456789',
    ownerName: 'Juan Pérez',
    propertyName: 'Finca La Esperanza',
    period: 2024,
    propertyTax: 50000,
    propertyTaxInterest: 1500,
    environmentalFee: 2000,
    environmentalFeeInterest: 60,
    fireSurcharge: 1000,
    fireSurchargeInterest: 30,
    total: 54590,
    ...overrides,
  };
}

function expectAtMostOneActiveSettlementPerPropertyPeriod(prisma: FakePrisma) {
  const activeSettlementsByPropertyPeriod = new Map<string, number>();

  for (const settlement of prisma.settlements) {
    if (settlement.status !== SettlementStatus.ACTIVE) continue;

    const key = `${settlement.propertyId}:${settlement.period}`;
    activeSettlementsByPropertyPeriod.set(
      key,
      (activeSettlementsByPropertyPeriod.get(key) ?? 0) + 1,
    );
  }

  for (const activeCount of activeSettlementsByPropertyPeriod.values()) {
    expect(activeCount).toBeLessThanOrEqual(1);
  }
}

describe('persistTaxRoll', () => {
  it('creates the property, owner, link, an ACTIVE settlement and its 6 detail lines', async () => {
    const prisma = new FakePrisma();

    const result = await persistTaxRoll(prisma as never, [buildRow()], false);

    expect(result).toEqual({
      properties: 1,
      owners: 1,
      settlements: 1,
      conflicts: [],
    });
    expect(prisma.properties).toHaveLength(1);
    expect(prisma.owners).toHaveLength(1);
    expect(prisma.propertyOwners).toEqual([
      { propertyId: 1, ownerId: 2, percentage: 100 },
    ]);
    expect(prisma.settlements).toEqual([
      {
        id: expect.any(Number),
        propertyId: 1,
        period: '2024',
        totalAmount: 54590,
        status: SettlementStatus.ACTIVE,
      },
    ]);
    expect(prisma.settlementDetails).toHaveLength(6);
    expect(
      prisma.settlementDetails.find(
        (d) => d.concept === 'Interés Impuesto Predial',
      ),
    ).toMatchObject({ amount: 1500 });
  });

  it('never recomputes interest: stores whatever the row states, even if it does not add up', async () => {
    const prisma = new FakePrisma();
    // Total intentionally does not equal the sum of the parts.
    const row = buildRow({ total: 999999 });

    await persistTaxRoll(prisma as never, [row], false);

    expect(prisma.settlements[0].totalAmount).toBe(999999);
  });

  it('a second import of the same property+period without confirmation is reported as a conflict, untouched', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(prisma as never, [buildRow({ total: 100 })], false);
    const originalSettlementId = prisma.settlements[0].id;

    const result = await persistTaxRoll(
      prisma as never,
      [buildRow({ total: 200 })],
      false,
    );

    expect(result.settlements).toBe(0);
    expect(result.conflicts).toEqual([
      { cadastralCode: '000100010001', period: 2024 },
    ]);
    expect(prisma.settlements).toHaveLength(1);
    expect(prisma.settlements[0]).toMatchObject({
      id: originalSettlementId,
      totalAmount: 100,
      status: SettlementStatus.ACTIVE,
    });
  });

  it('a second import of the same property+period WITH confirmation inactivates the old one and creates a new active one — never deletes it', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(prisma as never, [buildRow({ total: 100 })], false);

    const result = await persistTaxRoll(
      prisma as never,
      [buildRow({ total: 200 })],
      true,
    );

    expect(result.settlements).toBe(1);
    expect(result.conflicts).toEqual([]);
    expect(prisma.settlements).toHaveLength(2);
    expect(prisma.settlements[0]).toMatchObject({
      totalAmount: 100,
      status: SettlementStatus.INACTIVE,
    });
    expect(prisma.settlements[1]).toMatchObject({
      totalAmount: 200,
      status: SettlementStatus.ACTIVE,
    });
    expectAtMostOneActiveSettlementPerPropertyPeriod(prisma);
  });

  it('HU18 / ADR-6: repeated replacements retain each earlier settlement as inactive history', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(prisma as never, [buildRow({ total: 100 })], false);
    const firstSettlementId = prisma.settlements[0].id;

    await persistTaxRoll(prisma as never, [buildRow({ total: 200 })], true);
    const secondSettlementId = prisma.settlements[1].id;

    await persistTaxRoll(prisma as never, [buildRow({ total: 300 })], true);

    expect(prisma.settlements).toEqual([
      expect.objectContaining({
        id: firstSettlementId,
        totalAmount: 100,
        status: SettlementStatus.INACTIVE,
      }),
      expect.objectContaining({
        id: secondSettlementId,
        totalAmount: 200,
        status: SettlementStatus.INACTIVE,
      }),
      expect.objectContaining({
        totalAmount: 300,
        status: SettlementStatus.ACTIVE,
      }),
    ]);
    expect(prisma.settlements).toHaveLength(3);
  });

  it('a duplicate row for the same property+period within one file only creates one settlement', async () => {
    const prisma = new FakePrisma();

    const result = await persistTaxRoll(
      prisma as never,
      [buildRow({ total: 100 }), buildRow({ total: 200 })],
      false,
    );

    expect(result.settlements).toBe(1);
    expect(prisma.settlements).toHaveLength(1);
    expect(prisma.settlements[0].totalAmount).toBe(200); // last one wins
    expectAtMostOneActiveSettlementPerPropertyPeriod(prisma);
  });

  it('allows distinct periods for one property while preserving one active settlement per period', async () => {
    const prisma = new FakePrisma();

    const result = await persistTaxRoll(
      prisma as never,
      [buildRow({ period: 2024 }), buildRow({ period: 2025 })],
      false,
    );

    expect(result).toMatchObject({ settlements: 2, conflicts: [] });
    expect(prisma.settlements).toHaveLength(2);
    expectAtMostOneActiveSettlementPerPropertyPeriod(prisma);
  });

  it('allows the same period for distinct properties while preserving the invariant per property', async () => {
    const prisma = new FakePrisma();

    const result = await persistTaxRoll(
      prisma as never,
      [
        buildRow({ cadastralCode: '000100010001', period: 2024 }),
        buildRow({ cadastralCode: '000100010002', period: 2024 }),
      ],
      false,
    );

    expect(result).toMatchObject({ settlements: 2, conflicts: [] });
    expect(prisma.settlements).toHaveLength(2);
    expectAtMostOneActiveSettlementPerPropertyPeriod(prisma);
  });

  it('uses a placeholder name for a brand-new owner with no name in the file', async () => {
    const prisma = new FakePrisma();

    await persistTaxRoll(
      prisma as never,
      [buildRow({ ownerName: null })],
      false,
    );

    expect(prisma.owners[0].name).toBe('Propietario sin nombre registrado');
  });

  it('keeps an existing owner name when a later row has no name', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(
      prisma as never,
      [buildRow({ ownerName: 'Juan Pérez' })],
      false,
    );

    await persistTaxRoll(
      prisma as never,
      [
        buildRow({ ownerName: 'Juan Pérez' }),
        buildRow({
          cadastralCode: '000100010002',
          period: 2025,
          ownerName: null,
        }),
      ],
      false,
    );

    expect(prisma.owners[0].name).toBe('Juan Pérez');
  });

  it('throws a clear error when no municipality has been configured', async () => {
    const prisma = new FakePrisma();
    prisma.municipalities = [];

    await expect(
      persistTaxRoll(prisma as never, [buildRow()], false),
    ).rejects.toThrow(/No municipality is configured/);
  });

  it('does nothing for an empty row list', async () => {
    const prisma = new FakePrisma();

    const result = await persistTaxRoll(prisma as never, [], false);

    expect(result).toEqual({
      properties: 0,
      owners: 0,
      settlements: 0,
      conflicts: [],
    });
    expect(prisma.properties).toHaveLength(0);
  });
});
