import { SettlementStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import { LandUse } from './land-use.js';
import type { TaxRollRowDto } from './tax-roll-row.dto.js';
import { persistTaxRoll } from './persist-tax-roll.js';

const MUNICIPALITY_ID = 1;
const OTHER_MUNICIPALITY_ID = 2;

type FakeProperty = {
  id: number;
  municipalityId: number;
  cadastralCode: string;
  address: string;
  landUse: LandUse | null;
  appraisalValue: number;
};

type FakeOwner = {
  id: number;
  municipalityId: number;
  documentId: string;
  documentType: string | null;
  name: string;
};

type FakePropertyOwner = {
  propertyId: number;
  ownerId: number;
  percentage: number;
};

type FakeSettlement = {
  id: number;
  propertyId: number;
  period: number;
  totalAmount: number;
  status: SettlementStatus;
  replacedAt: Date | null;
  missingSince?: Date | null;
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
  properties: FakeProperty[] = [];
  owners: FakeOwner[] = [];
  propertyOwners: FakePropertyOwner[] = [];
  settlements: FakeSettlement[] = [];
  settlementDetails: FakeSettlementDetail[] = [];

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
      where: {
        cadastralCode: { in: string[] };
        municipalityId?: number | { not: number };
      };
    }) =>
      this.properties.filter((p) => {
        const municipality = where.municipalityId;
        const inMunicipality =
          municipality === undefined ||
          (typeof municipality === 'number'
            ? p.municipalityId === municipality
            : p.municipalityId !== municipality.not);
        return (
          inMunicipality && where.cadastralCode.in.includes(p.cadastralCode)
        );
      }),
  };

  owner = {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: {
        municipalityId_documentId: {
          municipalityId: number;
          documentId: string;
        };
      };
      create: Omit<FakeOwner, 'id'>;
      update: Partial<FakeOwner>;
    }) => {
      const key = where.municipalityId_documentId;
      const existing = this.owners.find(
        (o) =>
          o.municipalityId === key.municipalityId &&
          o.documentId === key.documentId,
      );
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const created = { id: this.nextId++, ...create };
      this.owners.push(created);
      return created;
    },
    findMany: async ({
      where,
    }: {
      where: { municipalityId: number; documentId: { in: string[] } };
    }) =>
      this.owners.filter(
        (o) =>
          o.municipalityId === where.municipalityId &&
          where.documentId.in.includes(o.documentId),
      ),
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

  private municipalityOfProperty(propertyId: number): number | undefined {
    return this.properties.find((p) => p.id === propertyId)?.municipalityId;
  }

  settlement = {
    findMany: async ({
      where,
    }: {
      where: {
        propertyId: { in: number[] };
        property: { municipalityId: number };
        replacedAt?: null;
      };
    }) =>
      this.settlements.filter(
        (s) =>
          where.propertyId.in.includes(s.propertyId) &&
          this.municipalityOfProperty(s.propertyId) ===
            where.property.municipalityId &&
          (where.replacedAt === undefined || s.replacedAt == null),
      ),
    createManyAndReturn: async ({
      data,
    }: {
      data: Omit<FakeSettlement, 'id' | 'replacedAt'>[];
    }) => {
      const created = data.map((d) => ({
        id: this.nextId++,
        replacedAt: null,
        ...d,
      }));
      this.settlements.push(...created);
      return created;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { id: { in: number[] }; property: { municipalityId: number } };
      data: Partial<FakeSettlement>;
    }) => {
      for (const s of this.settlements) {
        if (
          where.id.in.includes(s.id) &&
          this.municipalityOfProperty(s.propertyId) ===
            where.property.municipalityId
        ) {
          Object.assign(s, data);
        }
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
    landUse: LandUse.RURAL,
    appraisalValue: 1000000,
    taxId: '00123456789',
    documentType: null,
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

function expectAtMostOneCurrentSettlementPerPropertyPeriod(prisma: FakePrisma) {
  const currentSettlementsByPropertyPeriod = new Map<string, number>();

  for (const settlement of prisma.settlements) {
    if (settlement.replacedAt !== null) continue;

    const key = `${settlement.propertyId}:${settlement.period}`;
    currentSettlementsByPropertyPeriod.set(
      key,
      (currentSettlementsByPropertyPeriod.get(key) ?? 0) + 1,
    );
  }

  for (const currentCount of currentSettlementsByPropertyPeriod.values()) {
    expect(currentCount).toBeLessThanOrEqual(1);
  }
}

describe('persistTaxRoll', () => {
  it('creates the property, owner, link, a current settlement and its 6 detail lines', async () => {
    const prisma = new FakePrisma();

    const result = await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow()],
      false,
    );

    expect(result).toEqual({
      properties: 1,
      owners: 1,
      settlements: 1,
      conflicts: [],
      locked: [],
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
        period: 2024,
        totalAmount: 54590,
        status: SettlementStatus.VIGENTE,
        replacedAt: null,
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

    await persistTaxRoll(prisma as never, MUNICIPALITY_ID, [row], false);

    expect(prisma.settlements[0].totalAmount).toBe(999999);
  });

  it('a second import of the same property+period without confirmation is reported as a conflict, untouched', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ total: 100 })],
      false,
    );
    const originalSettlementId = prisma.settlements[0].id;

    const result = await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
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
      replacedAt: null,
    });
  });

  it('a second import of the same property+period WITH confirmation marks the old one as replaced and creates a new current one — never deletes it', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ total: 100 })],
      false,
    );

    const result = await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ total: 200 })],
      true,
    );

    expect(result.settlements).toBe(1);
    expect(result.conflicts).toEqual([]);
    expect(prisma.settlements).toHaveLength(2);
    expect(prisma.settlements[0]).toMatchObject({
      totalAmount: 100,
      status: SettlementStatus.VIGENTE,
      replacedAt: expect.any(Date),
    });
    expect(prisma.settlements[1]).toMatchObject({
      totalAmount: 200,
      status: SettlementStatus.VIGENTE,
      replacedAt: null,
    });
    expectAtMostOneCurrentSettlementPerPropertyPeriod(prisma);
  });

  describe('current-settlement uniqueness with the new lifecycle states', () => {
    it.each([
      SettlementStatus.PAGADA,
      SettlementStatus.ACUERDO_DE_PAGO,
      SettlementStatus.PRESCRITA,
    ])(
      'alerts and replaces a current %s settlement without changing its status',
      async (status) => {
        const prisma = new FakePrisma();
        await persistTaxRoll(
          prisma as never,
          MUNICIPALITY_ID,
          [buildRow({ total: 100 })],
          false,
        );
        prisma.settlements[0].status = status;

        const pending = await persistTaxRoll(
          prisma as never,
          MUNICIPALITY_ID,
          [buildRow({ total: 200 })],
          false,
        );

        expect(pending).toMatchObject({
          settlements: 0,
          conflicts: [{ cadastralCode: '000100010001', period: 2024 }],
        });
        expect(prisma.settlements).toHaveLength(1);

        await persistTaxRoll(
          prisma as never,
          MUNICIPALITY_ID,
          [buildRow({ total: 200 })],
          true,
        );

        expect(prisma.settlements).toEqual([
          expect.objectContaining({ status, replacedAt: expect.any(Date) }),
          expect.objectContaining({
            status: SettlementStatus.VIGENTE,
            replacedAt: null,
          }),
        ]);
        expectAtMostOneCurrentSettlementPerPropertyPeriod(prisma);
      },
    );
  });

  it('HU18 / ADR-6: repeated replacements retain each earlier settlement as replaced history, without touching its status', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ total: 100 })],
      false,
    );
    const firstSettlementId = prisma.settlements[0].id;

    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ total: 200 })],
      true,
    );
    const secondSettlementId = prisma.settlements[1].id;

    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ total: 300 })],
      true,
    );

    expect(prisma.settlements).toEqual([
      expect.objectContaining({
        id: firstSettlementId,
        totalAmount: 100,
        status: SettlementStatus.VIGENTE,
        replacedAt: expect.any(Date),
      }),
      expect.objectContaining({
        id: secondSettlementId,
        totalAmount: 200,
        status: SettlementStatus.VIGENTE,
        replacedAt: expect.any(Date),
      }),
      expect.objectContaining({
        totalAmount: 300,
        status: SettlementStatus.VIGENTE,
        replacedAt: null,
      }),
    ]);
    expect(prisma.settlements).toHaveLength(3);
  });

  it('a mixed file (some rows conflict, some do not) persists NOTHING until confirmed — a cancel leaves nothing written', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ total: 100 })],
      false,
    );

    const conflicting = buildRow({ total: 200 }); // same property+period as above
    const fresh = buildRow({
      cadastralCode: '000100010002',
      period: 2025,
      total: 300,
    });

    const result = await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [conflicting, fresh],
      false,
    );

    expect(result.settlements).toBe(0);
    expect(result.conflicts).toEqual([
      { cadastralCode: '000100010001', period: 2024 },
    ]);
    // `fresh` had no conflict of its own, but nothing gets created for it
    // either: only the settlement from the first import still exists.
    expect(prisma.settlements).toHaveLength(1);
    expect(prisma.settlements[0]).toMatchObject({ totalAmount: 100 });
  });

  it('once confirmed, a mixed file creates the new rows AND replaces the conflicting ones in the same pass', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ total: 100 })],
      false,
    );

    const conflicting = buildRow({ total: 200 });
    const fresh = buildRow({
      cadastralCode: '000100010002',
      period: 2025,
      total: 300,
    });

    const result = await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [conflicting, fresh],
      true,
    );

    expect(result.settlements).toBe(2);
    expect(result.conflicts).toEqual([]);
    const current = prisma.settlements.filter((s) => s.replacedAt === null);
    expect(current.map((s) => s.totalAmount).sort((a, b) => a - b)).toEqual([
      200, 300,
    ]);
    expect(
      prisma.settlements.filter((s) => s.replacedAt !== null),
    ).toHaveLength(1);
  });

  it('never replaces an EN_FIRME settlement: the row is skipped and reported as locked', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ total: 100 })],
      false,
    );
    prisma.settlements[0]!.status = SettlementStatus.EN_FIRME;

    const locked = buildRow({ total: 200 }); // same property+period, now final
    const fresh = buildRow({
      cadastralCode: '000100010002',
      period: 2025,
      total: 300,
    });

    const result = await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [locked, fresh],
      false,
    );

    // Not a conflict to confirm, so the rest of the file loads right away.
    expect(result.conflicts).toEqual([]);
    expect(result.locked).toEqual([
      { cadastralCode: '000100010001', period: 2024 },
    ]);
    expect(result.settlements).toBe(1);
    expect(prisma.settlements[0]).toMatchObject({
      totalAmount: 100,
      status: SettlementStatus.EN_FIRME,
      replacedAt: null,
    });
    expectAtMostOneCurrentSettlementPerPropertyPeriod(prisma);
  });

  describe('periods missing between imports (SL-136)', () => {
    const currentOf = (prisma: FakePrisma, period: number) =>
      prisma.settlements.find(
        (s) => s.period === period && s.replacedAt === null,
      )!;

    it('marks the period a later import no longer brings, and leaves the rest unmarked', async () => {
      const prisma = new FakePrisma();
      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [2014, 2015, 2016].map((period) => buildRow({ period })),
        false,
      );

      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [2014, 2016].map((period) => buildRow({ period })),
        true,
      );

      expect(currentOf(prisma, 2015).missingSince).toBeInstanceOf(Date);
      expect(currentOf(prisma, 2014).missingSince ?? null).toBeNull();
      expect(currentOf(prisma, 2016).missingSince ?? null).toBeNull();
      // Still the current settlement of its period: nothing is replaced.
      expect(currentOf(prisma, 2015).status).toBe(SettlementStatus.VIGENTE);
    });

    it('marks nothing while the replacement is not confirmed', async () => {
      const prisma = new FakePrisma();
      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [2014, 2015].map((period) => buildRow({ period })),
        false,
      );

      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [buildRow({ period: 2014 })],
        false,
      );

      expect(currentOf(prisma, 2015).missingSince ?? null).toBeNull();
    });

    it('keeps the date of the first import that missed the period', async () => {
      const prisma = new FakePrisma();
      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [2014, 2015].map((period) => buildRow({ period })),
        false,
      );
      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [buildRow({ period: 2014 })],
        true,
      );
      const firstMissed = new Date('2026-01-01T00:00:00Z');
      currentOf(prisma, 2015).missingSince = firstMissed;

      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [buildRow({ period: 2014 })],
        true,
      );

      expect(currentOf(prisma, 2015).missingSince).toBe(firstMissed);
    });

    it('the mark goes away when a later import brings the period back', async () => {
      const prisma = new FakePrisma();
      const both = [2014, 2015].map((period) => buildRow({ period }));
      await persistTaxRoll(prisma as never, MUNICIPALITY_ID, both, false);
      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [buildRow({ period: 2014 })],
        true,
      );
      expect(currentOf(prisma, 2015).missingSince).toBeInstanceOf(Date);

      await persistTaxRoll(prisma as never, MUNICIPALITY_ID, both, true);

      expect(currentOf(prisma, 2015).missingSince ?? null).toBeNull();
      expectAtMostOneCurrentSettlementPerPropertyPeriod(prisma);
    });

    it('does not mark a property the new import does not bring at all', async () => {
      const prisma = new FakePrisma();
      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [buildRow({ period: 2015 })],
        false,
      );

      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [buildRow({ cadastralCode: '000100010002', period: 2015 })],
        false,
      );

      expect(prisma.settlements[0]!.missingSince ?? null).toBeNull();
    });
  });

  it('a duplicate row for the same property+period within one file only creates one settlement', async () => {
    const prisma = new FakePrisma();

    const result = await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ total: 100 }), buildRow({ total: 200 })],
      false,
    );

    expect(result.settlements).toBe(1);
    expect(prisma.settlements).toHaveLength(1);
    expect(prisma.settlements[0].totalAmount).toBe(200); // last one wins
    expectAtMostOneCurrentSettlementPerPropertyPeriod(prisma);
  });

  it('allows distinct periods for one property while preserving one active settlement per period', async () => {
    const prisma = new FakePrisma();

    const result = await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ period: 2024 }), buildRow({ period: 2025 })],
      false,
    );

    expect(result).toMatchObject({ settlements: 2, conflicts: [] });
    expect(prisma.settlements).toHaveLength(2);
    expectAtMostOneCurrentSettlementPerPropertyPeriod(prisma);
  });

  it('allows the same period for distinct properties while preserving the invariant per property', async () => {
    const prisma = new FakePrisma();

    const result = await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [
        buildRow({ cadastralCode: '000100010001', period: 2024 }),
        buildRow({ cadastralCode: '000100010002', period: 2024 }),
      ],
      false,
    );

    expect(result).toMatchObject({ settlements: 2, conflicts: [] });
    expect(prisma.settlements).toHaveLength(2);
    expectAtMostOneCurrentSettlementPerPropertyPeriod(prisma);
  });

  it('uses a placeholder name for a brand-new owner with no name in the file', async () => {
    const prisma = new FakePrisma();

    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ ownerName: null })],
      false,
    );

    expect(prisma.owners[0].name).toBe('Propietario sin nombre registrado');
  });

  it('keeps an existing owner name when a later row has no name', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ ownerName: 'Juan Pérez' })],
      false,
    );

    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
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

  it('stores the normalized land use and never erases a known one with an unrecognized (null) value', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ landUse: LandUse.URBAN })],
      false,
    );
    expect(prisma.properties[0].landUse).toBe(LandUse.URBAN);

    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ period: 2025, landUse: null })],
      false,
    );

    expect(prisma.properties[0].landUse).toBe(LandUse.URBAN);
  });

  it('within one file, a later period with no land use keeps the one from an earlier period', async () => {
    const prisma = new FakePrisma();

    await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [
        buildRow({ period: 2024, landUse: LandUse.RURAL }),
        buildRow({ period: 2025, landUse: null }),
      ],
      false,
    );

    expect(prisma.properties[0].landUse).toBe(LandUse.RURAL);
  });

  it('keeps owners separate per municipality: the same document creates one owner in each', async () => {
    const prisma = new FakePrisma();

    await persistTaxRoll(prisma as never, MUNICIPALITY_ID, [buildRow()], false);
    await persistTaxRoll(
      prisma as never,
      OTHER_MUNICIPALITY_ID,
      [buildRow({ cadastralCode: '190000000001', ownerName: 'Otro Nombre' })],
      false,
    );

    expect(prisma.owners).toHaveLength(2);
    expect(
      prisma.owners.map((o) => [o.municipalityId, o.documentId, o.name]),
    ).toEqual([
      [MUNICIPALITY_ID, '00123456789', 'Juan Pérez'],
      [OTHER_MUNICIPALITY_ID, '00123456789', 'Otro Nombre'],
    ]);
  });

  it('leaves another municipality untouched: a cadastral code that already belongs to it is rejected and not edited', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(
      prisma as never,
      OTHER_MUNICIPALITY_ID,
      [buildRow({ propertyName: 'Original address' })],
      false,
    );

    await expect(
      persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [buildRow({ propertyName: 'Overwritten address' })],
        false,
      ),
    ).rejects.toMatchObject({ code: ErrorCode.TAX_ROLL_WRONG_MUNICIPALITY });

    expect(prisma.properties).toHaveLength(1);
    expect(prisma.properties[0]).toMatchObject({
      municipalityId: OTHER_MUNICIPALITY_ID,
      address: 'Original address',
    });
  });

  it('only sees conflicts inside its own municipality', async () => {
    const prisma = new FakePrisma();
    await persistTaxRoll(
      prisma as never,
      OTHER_MUNICIPALITY_ID,
      [buildRow({ cadastralCode: '190000000001' })],
      false,
    );

    const result = await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [buildRow({ cadastralCode: '150000000001' })],
      false,
    );

    expect(result.conflicts).toEqual([]);
    expect(result.settlements).toBe(1);
  });

  it('does nothing for an empty row list', async () => {
    const prisma = new FakePrisma();

    const result = await persistTaxRoll(
      prisma as never,
      MUNICIPALITY_ID,
      [],
      false,
    );

    expect(result).toEqual({
      properties: 0,
      owners: 0,
      settlements: 0,
      conflicts: [],
      locked: [],
    });
    expect(prisma.properties).toHaveLength(0);
  });
  describe('owner document type (SL-75)', () => {
    it('stores a new owner with the classification the file states', async () => {
      const prisma = new FakePrisma();
      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [buildRow({ documentType: 'CE' })],
        false,
      );

      expect(prisma.owners[0].documentType).toBe('CE');
    });

    it('stores a new owner with no classification as null -- never a default type', async () => {
      const prisma = new FakePrisma();
      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [buildRow()],
        false,
      );

      expect(prisma.owners[0].documentType).toBeNull();
    });

    it('fills in an existing owner that had no classification', async () => {
      const prisma = new FakePrisma();
      prisma.owners.push({
        id: 500,
        municipalityId: MUNICIPALITY_ID,
        documentId: '00123456789',
        documentType: null,
        name: 'Juan Pérez',
      });

      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [buildRow({ documentType: 'CC' })],
        false,
      );

      expect(prisma.owners).toHaveLength(1);
      expect(prisma.owners[0].documentType).toBe('CC');
    });

    it('a later file stating a different classification updates it, like the name', async () => {
      const prisma = new FakePrisma();
      prisma.owners.push({
        id: 500,
        municipalityId: MUNICIPALITY_ID,
        documentId: '00123456789',
        documentType: 'CC',
        name: 'Juan Pérez',
      });

      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [buildRow({ documentType: 'CE' })],
        false,
      );

      expect(prisma.owners[0].documentType).toBe('CE');
    });

    it('a row with no classification never erases a known one', async () => {
      const prisma = new FakePrisma();
      prisma.owners.push({
        id: 500,
        municipalityId: MUNICIPALITY_ID,
        documentId: '00123456789',
        documentType: 'NIT',
        name: 'Juan Pérez',
      });

      await persistTaxRoll(
        prisma as never,
        MUNICIPALITY_ID,
        [buildRow()],
        false,
      );

      expect(prisma.owners[0].documentType).toBe('NIT');
    });
  });
});
