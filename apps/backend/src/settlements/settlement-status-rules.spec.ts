import { SettlementStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  allowedStatuses,
  baseStatus,
  isTransitionAllowed,
} from './settlement-status-rules.js';

const { VIGENTE, EN_FIRME, PAGADA, ACUERDO_DE_PAGO, PRESCRITA } =
  SettlementStatus;
const NOW = new Date('2026-10-13T12:00:00Z');
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const yearsAgo = (years: number) => {
  const date = new Date(NOW);
  date.setFullYear(date.getFullYear() - years);
  return date;
};

const context = (
  current: SettlementStatus,
  resolutionIssuedAt: Date | null,
  firstPaymentOrderAt: Date | null = null,
) => ({ current, resolutionIssuedAt, firstPaymentOrderAt, now: NOW });

describe('baseStatus', () => {
  it('is EN_FIRME from the 60th day after the resolution was issued', () => {
    expect(baseStatus(daysAgo(59), NOW)).toBe(VIGENTE);
    expect(baseStatus(daysAgo(60), NOW)).toBe(EN_FIRME);
    expect(baseStatus(daysAgo(400), NOW)).toBe(EN_FIRME);
  });

  it('stays VIGENTE while the periods have no resolution', () => {
    expect(baseStatus(null, NOW)).toBe(VIGENTE);
  });
});

describe('allowedStatuses', () => {
  it('lets a VIGENTE liquidation be paid, agreed or marked PRESCRITA, never EN_FIRME by hand', () => {
    expect(allowedStatuses(context(VIGENTE, daysAgo(10)))).toEqual([
      VIGENTE,
      PAGADA,
      ACUERDO_DE_PAGO,
      PRESCRITA,
    ]);
  });

  it('never takes an EN_FIRME liquidation back to VIGENTE', () => {
    expect(isTransitionAllowed(context(EN_FIRME, daysAgo(90)), VIGENTE)).toBe(
      false,
    );
  });

  it('lets an EN_FIRME liquidation be paid or agreed', () => {
    const enFirme = context(EN_FIRME, daysAgo(90));
    expect(isTransitionAllowed(enFirme, PAGADA)).toBe(true);
    expect(isTransitionAllowed(enFirme, ACUERDO_DE_PAGO)).toBe(true);
  });

  it('only allows PRESCRITA from EN_FIRME 5 years after the payment order', () => {
    expect(isTransitionAllowed(context(EN_FIRME, daysAgo(90)), PRESCRITA)).toBe(
      false,
    );
    expect(
      isTransitionAllowed(
        context(EN_FIRME, yearsAgo(6), yearsAgo(4)),
        PRESCRITA,
      ),
    ).toBe(false);
    expect(
      isTransitionAllowed(
        context(EN_FIRME, yearsAgo(6), yearsAgo(5)),
        PRESCRITA,
      ),
    ).toBe(true);
  });

  it('returns a paid liquidation to its base state: EN_FIRME after 60 days, VIGENTE before', () => {
    expect(allowedStatuses(context(PAGADA, daysAgo(90)))).toEqual([
      EN_FIRME,
      PAGADA,
      ACUERDO_DE_PAGO,
    ]);
    expect(allowedStatuses(context(PAGADA, daysAgo(10)))).toEqual([
      VIGENTE,
      PAGADA,
      ACUERDO_DE_PAGO,
      PRESCRITA,
    ]);
  });

  it('keeps the current state allowed so re-sending it is a no-op', () => {
    expect(
      isTransitionAllowed(context(PRESCRITA, daysAgo(90)), PRESCRITA),
    ).toBe(true);
  });
});
