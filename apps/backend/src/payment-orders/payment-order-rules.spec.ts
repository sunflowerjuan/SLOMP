import { describe, expect, it } from 'vitest';
import {
  canPrescribeFromFirm,
  evaluatePaymentOrderEligibility,
  FIRM_AFTER_DAYS,
  firmOn,
  groupSettlementsByProperty,
  isFirm,
  PRESCRIPTION_YEARS_AFTER_PAYMENT_ORDER,
  prescriptionAvailableOn,
  type PaymentOrderCandidate,
} from './payment-order-rules.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const RESOLUTION_ISSUED_AT = new Date('2026-01-10T15:00:00.000Z');
const daysAfter = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY_MS);

function candidate(
  overrides: Partial<PaymentOrderCandidate> = {},
): PaymentOrderCandidate {
  return {
    status: 'VIGENTE',
    replacedAt: null,
    resolutionIssuedAt: RESOLUTION_ISSUED_AT,
    hasPaymentOrder: false,
    ...overrides,
  };
}

describe('the rules use the agreed numbers', () => {
  it('60 days to be firm and 5 years to prescribe', () => {
    expect(FIRM_AFTER_DAYS).toBe(60);
    expect(PRESCRIPTION_YEARS_AFTER_PAYMENT_ORDER).toBe(5);
  });
});

describe('isFirm / firmOn: 60 days from the generation of the resolution', () => {
  it('becomes firm exactly 60 days after the resolution was generated', () => {
    expect(firmOn(RESOLUTION_ISSUED_AT)).toEqual(
      daysAfter(RESOLUTION_ISSUED_AT, 60),
    );
  });

  it('is not firm the instant it is generated', () => {
    expect(isFirm(RESOLUTION_ISSUED_AT, RESOLUTION_ISSUED_AT)).toBe(false);
  });

  it('is not firm one millisecond before the 60 days', () => {
    const now = new Date(daysAfter(RESOLUTION_ISSUED_AT, 60).getTime() - 1);
    expect(isFirm(RESOLUTION_ISSUED_AT, now)).toBe(false);
  });

  it('is firm exactly at 60 days', () => {
    expect(
      isFirm(RESOLUTION_ISSUED_AT, daysAfter(RESOLUTION_ISSUED_AT, 60)),
    ).toBe(true);
  });

  it('stays firm afterwards', () => {
    expect(
      isFirm(RESOLUTION_ISSUED_AT, daysAfter(RESOLUTION_ISSUED_AT, 400)),
    ).toBe(true);
  });

  it('is not firm 59 days in', () => {
    expect(
      isFirm(RESOLUTION_ISSUED_AT, daysAfter(RESOLUTION_ISSUED_AT, 59)),
    ).toBe(false);
  });
});

describe('evaluatePaymentOrderEligibility', () => {
  const firmNow = daysAfter(RESOLUTION_ISSUED_AT, 61);

  it('allows a payment order once the settlement is firm', () => {
    expect(evaluatePaymentOrderEligibility(candidate(), firmNow)).toEqual({
      eligible: true,
    });
  });

  it('allows it at exactly 60 days', () => {
    expect(
      evaluatePaymentOrderEligibility(
        candidate(),
        daysAfter(RESOLUTION_ISSUED_AT, 60),
      ),
    ).toEqual({ eligible: true });
  });

  it('does not allow it before 60 days from the resolution, and says when it will be firm', () => {
    const result = evaluatePaymentOrderEligibility(
      candidate(),
      daysAfter(RESOLUTION_ISSUED_AT, 59),
    );

    expect(result).toEqual({
      eligible: false,
      reason: 'NOT_YET_FIRM',
      firmOn: daysAfter(RESOLUTION_ISSUED_AT, 60),
    });
  });

  it('does not allow it the same day the resolution is generated', () => {
    expect(
      evaluatePaymentOrderEligibility(candidate(), RESOLUTION_ISSUED_AT),
    ).toMatchObject({ eligible: false, reason: 'NOT_YET_FIRM' });
  });

  it('does not allow it without a resolution: nothing was notified', () => {
    expect(
      evaluatePaymentOrderEligibility(
        candidate({ resolutionIssuedAt: null }),
        firmNow,
      ),
    ).toEqual({ eligible: false, reason: 'NO_RESOLUTION' });
  });

  it('accepts a settlement whose status is already EN_FIRME', () => {
    expect(
      evaluatePaymentOrderEligibility(
        candidate({ status: 'EN_FIRME' }),
        firmNow,
      ),
    ).toEqual({ eligible: true });
  });

  it.each(['PAGADA', 'ACUERDO_DE_PAGO', 'PRESCRITA'])(
    'does not allow it for a %s settlement: it is no longer owed',
    (status) => {
      expect(
        evaluatePaymentOrderEligibility(candidate({ status }), firmNow),
      ).toEqual({ eligible: false, reason: 'STATUS_NOT_ELIGIBLE' });
    },
  );

  it('does not allow it for a settlement that was replaced', () => {
    expect(
      evaluatePaymentOrderEligibility(
        candidate({ replacedAt: new Date('2026-02-01') }),
        firmNow,
      ),
    ).toEqual({ eligible: false, reason: 'SETTLEMENT_REPLACED' });
  });

  it('does not allow a second payment order for the same settlement', () => {
    expect(
      evaluatePaymentOrderEligibility(
        candidate({ hasPaymentOrder: true }),
        firmNow,
      ),
    ).toEqual({ eligible: false, reason: 'ALREADY_HAS_PAYMENT_ORDER' });
  });

  it('reports a replaced settlement before any other reason', () => {
    expect(
      evaluatePaymentOrderEligibility(
        candidate({
          replacedAt: new Date('2026-02-01'),
          hasPaymentOrder: true,
          resolutionIssuedAt: null,
          status: 'PAGADA',
        }),
        RESOLUTION_ISSUED_AT,
      ),
    ).toEqual({ eligible: false, reason: 'SETTLEMENT_REPLACED' });
  });

  it('never depends on the system clock: the same input gives the same answer', () => {
    const now = daysAfter(RESOLUTION_ISSUED_AT, 30);
    expect(evaluatePaymentOrderEligibility(candidate(), now)).toEqual(
      evaluatePaymentOrderEligibility(candidate(), now),
    );
  });
});

describe('prescription from "En firme": 5 years after the payment order', () => {
  const ORDER_ISSUED_AT = new Date('2026-03-15T12:00:00.000Z');

  it('becomes available exactly 5 calendar years after the payment order was generated', () => {
    expect(prescriptionAvailableOn(ORDER_ISSUED_AT)).toEqual(
      new Date('2031-03-15T12:00:00.000Z'),
    );
  });

  it('is not allowed the day the payment order is generated', () => {
    expect(canPrescribeFromFirm(ORDER_ISSUED_AT, ORDER_ISSUED_AT)).toBe(false);
  });

  it('is not allowed after 4 years and 364 days', () => {
    expect(
      canPrescribeFromFirm(
        ORDER_ISSUED_AT,
        new Date('2031-03-14T12:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('is not allowed one millisecond before the 5 years', () => {
    const justBefore = new Date(
      prescriptionAvailableOn(ORDER_ISSUED_AT).getTime() - 1,
    );
    expect(canPrescribeFromFirm(ORDER_ISSUED_AT, justBefore)).toBe(false);
  });

  it('is allowed exactly at 5 years', () => {
    expect(
      canPrescribeFromFirm(
        ORDER_ISSUED_AT,
        new Date('2031-03-15T12:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('stays allowed afterwards', () => {
    expect(
      canPrescribeFromFirm(
        ORDER_ISSUED_AT,
        new Date('2040-01-01T00:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('counts from the payment order, not from the resolution: 5 years from the resolution is not enough', () => {
    const resolutionIssuedAt = new Date('2026-01-10T15:00:00.000Z');
    const fiveYearsAfterResolution = new Date('2031-01-10T15:00:00.000Z');

    expect(
      canPrescribeFromFirm(ORDER_ISSUED_AT, fiveYearsAfterResolution),
    ).toBe(false);
    expect(prescriptionAvailableOn(resolutionIssuedAt).getTime()).toBeLessThan(
      prescriptionAvailableOn(ORDER_ISSUED_AT).getTime(),
    );
  });

  it('is never allowed without a payment order: there is no date to count from', () => {
    expect(
      canPrescribeFromFirm(null, new Date('2100-01-01T00:00:00.000Z')),
    ).toBe(false);
  });

  it('handles a payment order generated on Feb 29', () => {
    const leapDay = new Date('2028-02-29T10:00:00.000Z');

    expect(prescriptionAvailableOn(leapDay)).toEqual(
      new Date('2033-03-01T10:00:00.000Z'),
    );
    expect(
      canPrescribeFromFirm(leapDay, new Date('2033-02-28T10:00:00.000Z')),
    ).toBe(false);
  });
});

describe('groupSettlementsByProperty', () => {
  it('puts the periods of a property together and sorts by property and id', () => {
    expect(
      groupSettlementsByProperty([
        { id: 9, propertyId: 2 },
        { id: 5, propertyId: 1 },
        { id: 3, propertyId: 2 },
        { id: 1, propertyId: 1 },
      ]),
    ).toEqual([
      { propertyId: 1, settlementIds: [1, 5] },
      { propertyId: 2, settlementIds: [3, 9] },
    ]);
  });

  it('gives nothing for no settlements', () => {
    expect(groupSettlementsByProperty([])).toEqual([]);
  });
});
