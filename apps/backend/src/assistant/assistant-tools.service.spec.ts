import { BadRequestException } from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import {
  AssistantToolsService,
  MAX_CHANGES_PER_CALL,
  MAX_SEARCH_RESULTS,
  MAX_UNLISTED_ROWS,
} from './assistant-tools.service.js';

const { EN_FIRME, PAGADA, ACUERDO_DE_PAGO, PRESCRITA } = SettlementStatus;
const MUNICIPALITY_ID = 7;
const NOW = new Date('2026-10-29T12:00:00Z');
const yearsAgo = (years: number) => {
  const date = new Date(NOW);
  date.setFullYear(date.getFullYear() - years);
  return date;
};
const CODE = '155140001000200030000';

interface FakeRow {
  id: number;
  period?: number;
  status?: SettlementStatus;
  replacedAt?: Date | null;
  cadastralCode?: string;
  paymentOrder?: { number: string; issuedAt: Date } | null;
}

// What ASSISTANT_SETTLEMENT_SELECT returns. Settlements in a resolution
// issued two years ago, so EN_FIRME is their base state.
const row = (fake: FakeRow) => ({
  id: fake.id,
  period: fake.period ?? 2020,
  status: fake.status ?? EN_FIRME,
  replacedAt: fake.replacedAt ?? null,
  property: { cadastralCode: fake.cadastralCode ?? CODE },
  resolution: { issuedAt: yearsAgo(2) },
  paymentOrder: fake.paymentOrder ?? null,
});

function buildPrisma(rows: FakeRow[] = []) {
  // Only reads: a write here would fail the test with "not a function".
  return {
    settlement: { findMany: vi.fn(async () => rows.map(row)) },
  };
}

const PERSONAL_FIELDS = /owner|name|document|address|phone|email/i;

describe('AssistantToolsService.searchSettlements', () => {
  it('searches the current settlements of the active municipality by cadastral code, at most 50', async () => {
    const prisma = buildPrisma([{ id: 1 }]);
    const tools = new AssistantToolsService(prisma as never);

    await tools.searchSettlements(MUNICIPALITY_ID, {
      cadastralCode: ` ${CODE} `,
    });

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          replacedAt: null,
          property: { municipalityId: MUNICIPALITY_ID, cadastralCode: CODE },
        },
        take: MAX_SEARCH_RESULTS,
      }),
    );
  });

  it('searches one settlement by its number, in the active municipality only', async () => {
    const prisma = buildPrisma([]);
    const tools = new AssistantToolsService(prisma as never);

    await expect(
      tools.searchSettlements(MUNICIPALITY_ID, { settlementId: 123 }),
    ).resolves.toEqual([]);
    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          replacedAt: null,
          property: { municipalityId: MUNICIPALITY_ID },
          id: 123,
        },
      }),
    );
  });

  it('returns only id, cadastralCode, period, status, allowedStatuses and hasPaymentOrder', async () => {
    const prisma = buildPrisma([
      { id: 1 },
      { id: 2, paymentOrder: { number: '2026-0004', issuedAt: yearsAgo(1) } },
    ]);
    const tools = new AssistantToolsService(prisma as never);

    const result = await tools.searchSettlements(
      MUNICIPALITY_ID,
      { cadastralCode: CODE },
      NOW,
    );

    expect(result).toEqual([
      {
        id: 1,
        cadastralCode: CODE,
        period: 2020,
        status: EN_FIRME,
        allowedStatuses: [EN_FIRME, PAGADA, ACUERDO_DE_PAGO, PRESCRITA],
        hasPaymentOrder: false,
      },
      {
        id: 2,
        cadastralCode: CODE,
        period: 2020,
        status: EN_FIRME,
        allowedStatuses: [EN_FIRME, PAGADA, ACUERDO_DE_PAGO],
        hasPaymentOrder: true,
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(PERSONAL_FIELDS);
  });

  it.each([
    [{}],
    [{ cadastralCode: '   ' }],
    [{ cadastralCode: CODE, settlementId: 1 }],
    // The model asking for an owner or an address gives no criterion.
    [{ owner: 'Apellido Ejemplo' }],
    [{ address: 'Finca La Esperanza' }],
    [{ settlementId: 0 }],
  ])('rejects %o without querying', async (input) => {
    const prisma = buildPrisma();
    const tools = new AssistantToolsService(prisma as never);

    const error = await tools
      .searchSettlements(MUNICIPALITY_ID, input as never)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: ErrorCode.ASSISTANT_TOOL_INPUT_INVALID,
    });
    expect(prisma.settlement.findMany).not.toHaveBeenCalled();
  });
});

describe('AssistantToolsService.findUnlistedPeriods', () => {
  it('returns, for each property in the file, its current periods the file leaves out', async () => {
    const other = '155140001000200040000';
    const prisma = buildPrisma([
      { id: 1, period: 2019 },
      { id: 2, period: 2020 },
      { id: 3, period: 2021 },
      { id: 4, period: 2018, cadastralCode: other },
      { id: 5, period: 2019, cadastralCode: other },
    ]);
    const tools = new AssistantToolsService(prisma as never);

    const result = await tools.findUnlistedPeriods(
      MUNICIPALITY_ID,
      [
        { cadastralCode: CODE, period: 2019 },
        { cadastralCode: other, period: 2019 },
      ],
      NOW,
    );

    expect(result.map(({ id }) => id)).toEqual([2, 3, 4]);
    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          replacedAt: null,
          property: {
            municipalityId: MUNICIPALITY_ID,
            cadastralCode: { in: [CODE, other] },
          },
        },
      }),
    );
    expect(JSON.stringify(result)).not.toMatch(PERSONAL_FIELDS);
  });

  it('rejects more than 5000 rows', async () => {
    const prisma = buildPrisma();
    const tools = new AssistantToolsService(prisma as never);
    const rows = Array.from({ length: MAX_UNLISTED_ROWS + 1 }, (_, i) => ({
      cadastralCode: CODE,
      period: 1980 + (i % 40),
    }));

    await expect(
      tools.findUnlistedPeriods(MUNICIPALITY_ID, rows),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.settlement.findMany).not.toHaveBeenCalled();
  });
});

describe('AssistantToolsService.proposeStatusChange', () => {
  it('accepts an allowed change and writes nothing', async () => {
    const prisma = buildPrisma([{ id: 123 }]);
    const tools = new AssistantToolsService(prisma as never);

    await expect(
      tools.proposeStatusChange(
        MUNICIPALITY_ID,
        [{ settlementId: 123, toStatus: PAGADA }],
        NOW,
      ),
    ).resolves.toEqual({
      accepted: [{ settlementId: 123, from: EN_FIRME, to: PAGADA }],
      rejected: [],
    });
  });

  describe('PRESCRITA from EN_FIRME', () => {
    it('is accepted when the settlement is in no payment order', async () => {
      const prisma = buildPrisma([{ id: 501 }]);
      const tools = new AssistantToolsService(prisma as never);

      const review = await tools.proposeStatusChange(
        MUNICIPALITY_ID,
        [{ settlementId: 501, toStatus: PRESCRITA }],
        NOW,
      );

      expect(review.accepted).toEqual([
        { settlementId: 501, from: EN_FIRME, to: PRESCRITA },
      ]);
    });

    it('is rejected while its payment order is younger than 5 years, with what the panel needs to explain it', async () => {
      const paymentOrder = { number: '2026-0004', issuedAt: yearsAgo(4) };
      const prisma = buildPrisma([{ id: 789, paymentOrder }]);
      const tools = new AssistantToolsService(prisma as never);

      const review = await tools.proposeStatusChange(
        MUNICIPALITY_ID,
        [{ settlementId: 789, toStatus: PRESCRITA }],
        NOW,
      );

      expect(review).toEqual({
        accepted: [],
        rejected: [
          {
            settlementId: 789,
            reason: 'TRANSITION_NOT_ALLOWED',
            allowed: [EN_FIRME, PAGADA, ACUERDO_DE_PAGO],
            current: EN_FIRME,
            paymentOrder,
          },
        ],
      });
    });

    it('is accepted once its payment order is 5 years old', async () => {
      const prisma = buildPrisma([
        {
          id: 790,
          paymentOrder: { number: '2021-0001', issuedAt: yearsAgo(5) },
        },
      ]);
      const tools = new AssistantToolsService(prisma as never);

      const review = await tools.proposeStatusChange(
        MUNICIPALITY_ID,
        [{ settlementId: 790, toStatus: PRESCRITA }],
        NOW,
      );

      expect(review.rejected).toEqual([]);
    });
  });

  it('answers NOT_FOUND for a settlement of another municipality, and REPLACED for a replaced one', async () => {
    // Settlement 2 belongs to another municipality: the scoped query
    // doesn't bring it.
    const prisma = buildPrisma([{ id: 3, replacedAt: yearsAgo(1) }]);
    const tools = new AssistantToolsService(prisma as never);

    const review = await tools.proposeStatusChange(
      MUNICIPALITY_ID,
      [
        { settlementId: 2, toStatus: PAGADA },
        { settlementId: 3, toStatus: PAGADA },
      ],
      NOW,
    );

    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [2, 3] },
          property: { municipalityId: MUNICIPALITY_ID },
        },
      }),
    );
    expect(review.rejected).toEqual([
      { settlementId: 2, reason: 'NOT_FOUND', allowed: [] },
      { settlementId: 3, reason: 'REPLACED', allowed: [], current: EN_FIRME },
    ]);
  });

  it(`rejects more than ${MAX_CHANGES_PER_CALL} changes, and a settlement listed twice`, async () => {
    const prisma = buildPrisma();
    const tools = new AssistantToolsService(prisma as never);
    const tooMany = Array.from(
      { length: MAX_CHANGES_PER_CALL + 1 },
      (_, i) => ({ settlementId: i + 1, toStatus: PAGADA }),
    );

    await expect(
      tools.proposeStatusChange(MUNICIPALITY_ID, tooMany),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      tools.proposeStatusChange(MUNICIPALITY_ID, [
        { settlementId: 1, toStatus: PAGADA },
        { settlementId: 1, toStatus: ACUERDO_DE_PAGO },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      tools.proposeStatusChange(MUNICIPALITY_ID, []),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.settlement.findMany).not.toHaveBeenCalled();
  });
});
