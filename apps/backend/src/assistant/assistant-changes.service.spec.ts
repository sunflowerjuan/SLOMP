import { BadRequestException, ConflictException } from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import { AssistantChangesService } from './assistant-changes.service.js';
import { MAX_CHANGES_PER_CALL } from './assistant-tools.service.js';

const { VIGENTE, EN_FIRME, PAGADA, PRESCRITA } = SettlementStatus;
const MUNICIPALITY_ID = 7;
const ADMIN_ID = 42;
const NOW = new Date('2026-10-29T12:00:00Z');
const yearsAgo = (years: number) => {
  const date = new Date(NOW);
  date.setFullYear(date.getFullYear() - years);
  return date;
};

interface FakeRow {
  id: number;
  status?: SettlementStatus;
  paymentOrderYearsAgo?: number;
}

const row = (fake: FakeRow) => ({
  id: fake.id,
  period: 2020,
  status: fake.status ?? EN_FIRME,
  replacedAt: null,
  property: { cadastralCode: '155140001000200030000' },
  resolution: { issuedAt: yearsAgo(2) },
  paymentOrder:
    fake.paymentOrderYearsAgo === undefined
      ? null
      : { number: '2026-0004', issuedAt: yearsAgo(fake.paymentOrderYearsAgo) },
});

// `rows` are what the scoped query finds when the transaction re-reads them.
function buildPrisma(rows: FakeRow[]) {
  const tx = {
    $queryRaw: vi.fn(async () => []),
    settlement: {
      findMany: vi.fn(async () => rows.map(row)),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    settlementEvent: { createMany: vi.fn(async () => ({ count: 0 })) },
  };
  const prisma = {
    $transaction: vi.fn(async (run: (client: typeof tx) => unknown) => run(tx)),
  };
  return { prisma, tx };
}

describe('AssistantChangesService.confirm', () => {
  it('applies exactly the listed settlements and records an ASSISTANT event for each, with the administrator and the note', async () => {
    // 10 and 11 share a resolution with 12, which is not in the list.
    const { prisma, tx } = buildPrisma([{ id: 10 }, { id: 11 }]);
    const service = new AssistantChangesService(prisma as never);

    const result = await service.confirm(
      MUNICIPALITY_ID,
      ADMIN_ID,
      [
        { settlementId: 10, toStatus: PAGADA },
        { settlementId: 11, toStatus: PAGADA },
      ],
      '  Firmó el lunes ',
      NOW,
    );

    expect(result).toEqual({
      applied: [
        { settlementId: 10, from: EN_FIRME, to: PAGADA },
        { settlementId: 11, from: EN_FIRME, to: PAGADA },
      ],
      unchanged: [],
    });
    expect(tx.settlement.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.settlement.updateMany).toHaveBeenCalledWith({
      where: { id: 10, status: EN_FIRME, replacedAt: null },
      data: { status: PAGADA },
    });
    expect(tx.settlement.updateMany).toHaveBeenCalledWith({
      where: { id: 11, status: EN_FIRME, replacedAt: null },
      data: { status: PAGADA },
    });
    expect(tx.settlementEvent.createMany).toHaveBeenCalledWith({
      data: [10, 11].map((settlementId) => ({
        settlementId,
        municipalityId: MUNICIPALITY_ID,
        type: 'STATUS_CHANGED',
        fromStatus: EN_FIRME,
        toStatus: PAGADA,
        source: 'ASSISTANT',
        note: 'Firmó el lunes',
        administratorId: ADMIN_ID,
      })),
    });
  });

  it('locks the rows and re-reads them in the active municipality, inside the transaction', async () => {
    const { prisma, tx } = buildPrisma([{ id: 10 }]);
    const service = new AssistantChangesService(prisma as never);

    await service.confirm(
      MUNICIPALITY_ID,
      ADMIN_ID,
      [{ settlementId: 10, toStatus: PAGADA }],
      undefined,
      NOW,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const [query, ...values] = tx.$queryRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    expect(query.join('?')).toMatch(/FOR UPDATE OF s/);
    expect(values).toContain(MUNICIPALITY_ID);
    expect(tx.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [10] },
          property: { municipalityId: MUNICIPALITY_ID },
        },
      }),
    );
    expect(tx.settlementEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ note: null })],
    });
  });

  it('answers 409 with the rejected ones and applies none when one no longer allows the change', async () => {
    // 12 got a payment order after the proposal was shown: PRESCRITA is
    // no longer allowed for it.
    const { prisma, tx } = buildPrisma([
      { id: 11 },
      { id: 12, paymentOrderYearsAgo: 1 },
    ]);
    const service = new AssistantChangesService(prisma as never);

    const error = await service
      .confirm(
        MUNICIPALITY_ID,
        ADMIN_ID,
        [
          { settlementId: 11, toStatus: PRESCRITA },
          { settlementId: 12, toStatus: PRESCRITA },
        ],
        undefined,
        NOW,
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getStatus()).toBe(409);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: ErrorCode.ASSISTANT_CHANGES_REJECTED,
      details: {
        rejected: [
          {
            settlementId: 12,
            reason: 'TRANSITION_NOT_ALLOWED',
            current: EN_FIRME,
          },
        ],
      },
    });
    expect(tx.settlement.updateMany).not.toHaveBeenCalled();
    expect(tx.settlementEvent.createMany).not.toHaveBeenCalled();
  });

  it('answers 409 for a settlement of another municipality, applying none', async () => {
    // 99 is not found in the active municipality.
    const { prisma, tx } = buildPrisma([{ id: 10 }]);
    const service = new AssistantChangesService(prisma as never);

    const error = await service
      .confirm(
        MUNICIPALITY_ID,
        ADMIN_ID,
        [
          { settlementId: 10, toStatus: PAGADA },
          { settlementId: 99, toStatus: PAGADA },
        ],
        undefined,
        NOW,
      )
      .catch((caught: unknown) => caught);

    expect((error as ConflictException).getResponse()).toMatchObject({
      details: { rejected: [{ settlementId: 99, reason: 'NOT_FOUND' }] },
    });
    expect(tx.settlement.updateMany).not.toHaveBeenCalled();
  });

  it('changes and records nothing for a settlement already in the requested state', async () => {
    const { prisma, tx } = buildPrisma([
      { id: 10, status: PAGADA },
      { id: 11 },
    ]);
    const service = new AssistantChangesService(prisma as never);

    const result = await service.confirm(
      MUNICIPALITY_ID,
      ADMIN_ID,
      [
        { settlementId: 10, toStatus: PAGADA },
        { settlementId: 11, toStatus: PAGADA },
      ],
      undefined,
      NOW,
    );

    expect(result.unchanged).toEqual([10]);
    expect(tx.settlement.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.settlementEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ settlementId: 11 })],
    });
  });

  it('never takes an EN_FIRME settlement back to VIGENTE', async () => {
    const { prisma, tx } = buildPrisma([{ id: 10 }]);
    const service = new AssistantChangesService(prisma as never);

    await expect(
      service.confirm(
        MUNICIPALITY_ID,
        ADMIN_ID,
        [{ settlementId: 10, toStatus: VIGENTE }],
        undefined,
        NOW,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.settlement.updateMany).not.toHaveBeenCalled();
  });

  it(`rejects more than ${MAX_CHANGES_PER_CALL} changes before opening a transaction`, async () => {
    const { prisma } = buildPrisma([]);
    const service = new AssistantChangesService(prisma as never);
    const changes = Array.from(
      { length: MAX_CHANGES_PER_CALL + 1 },
      (_, i) => ({ settlementId: i + 1, toStatus: PAGADA }),
    );

    await expect(
      service.confirm(MUNICIPALITY_ID, ADMIN_ID, changes),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
