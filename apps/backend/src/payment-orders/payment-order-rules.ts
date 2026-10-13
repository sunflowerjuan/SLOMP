// Business rules of the payment order (mandamiento de pago). Pure functions
// with no framework or database dependencies: the clock is always injected,
// so tests never depend on the system time.

// A settlement is "En firme" this many days after its resolution was
// generated. Generation and notification are the same instant.
export const FIRM_AFTER_DAYS = 60;

// From "En firme" a settlement can become PRESCRITA only this many years
// after its payment order was generated.
export const PRESCRIPTION_YEARS_AFTER_PAYMENT_ORDER = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

// The settlement statuses a payment order can be generated from: the ones an
// unpaid settlement can be in once it is firm. VIGENTE becomes EN_FIRME by
// itself after FIRM_AFTER_DAYS; PAGADA, ACUERDO_DE_PAGO and PRESCRITA are
// already resolved. Compared as plain strings so these rules do not depend
// on the database enum.
const FIRM_CAPABLE_STATUSES: readonly string[] = ['VIGENTE', 'EN_FIRME'];

// The instant a settlement whose resolution was generated at `resolutionIssuedAt`
// becomes "En firme".
export function firmOn(resolutionIssuedAt: Date): Date {
  return new Date(resolutionIssuedAt.getTime() + FIRM_AFTER_DAYS * DAY_MS);
}

export function isFirm(resolutionIssuedAt: Date, now: Date): boolean {
  return now.getTime() >= firmOn(resolutionIssuedAt).getTime();
}

export type PaymentOrderIneligibleReason =
  | 'SETTLEMENT_REPLACED'
  | 'ALREADY_HAS_PAYMENT_ORDER'
  | 'NO_RESOLUTION'
  | 'STATUS_NOT_ELIGIBLE'
  | 'NOT_YET_FIRM';

export interface PaymentOrderCandidate {
  status: string;
  // Non-null once a newer tax roll superseded this settlement.
  replacedAt: Date | null;
  // Generation date of the resolution the settlement belongs to; null if no
  // resolution was generated yet.
  resolutionIssuedAt: Date | null;
  hasPaymentOrder: boolean;
}

export type PaymentOrderEligibility =
  | { eligible: true }
  | {
      eligible: false;
      reason: PaymentOrderIneligibleReason;
      // Only for NOT_YET_FIRM: when it will be firm.
      firmOn?: Date;
    };

// A payment order can be generated only for a settlement that is "En firme":
// its resolution was generated at least FIRM_AFTER_DAYS days ago and it is
// still owed (not paid, not under a payment agreement, not prescribed).
export function evaluatePaymentOrderEligibility(
  candidate: PaymentOrderCandidate,
  now: Date,
): PaymentOrderEligibility {
  if (candidate.replacedAt !== null) {
    return { eligible: false, reason: 'SETTLEMENT_REPLACED' };
  }
  if (candidate.hasPaymentOrder) {
    return { eligible: false, reason: 'ALREADY_HAS_PAYMENT_ORDER' };
  }
  if (candidate.resolutionIssuedAt === null) {
    return { eligible: false, reason: 'NO_RESOLUTION' };
  }
  if (!FIRM_CAPABLE_STATUSES.includes(candidate.status)) {
    return { eligible: false, reason: 'STATUS_NOT_ELIGIBLE' };
  }
  if (!isFirm(candidate.resolutionIssuedAt, now)) {
    return {
      eligible: false,
      reason: 'NOT_YET_FIRM',
      firmOn: firmOn(candidate.resolutionIssuedAt),
    };
  }
  return { eligible: true };
}

// The instant from which a settlement with a payment order generated at
// `paymentOrderIssuedAt` may pass from "En firme" to PRESCRITA. Calendar
// years in UTC; a Feb 29 order lands on Mar 1 in a non-leap year.
export function prescriptionAvailableOn(paymentOrderIssuedAt: Date): Date {
  const date = new Date(paymentOrderIssuedAt.getTime());
  date.setUTCFullYear(
    date.getUTCFullYear() + PRESCRIPTION_YEARS_AFTER_PAYMENT_ORDER,
  );
  return date;
}

// An "En firme" settlement may become PRESCRITA only once
// PRESCRIPTION_YEARS_AFTER_PAYMENT_ORDER years have passed since its payment
// order was generated. Without a payment order there is no such date, so it
// cannot.
export function canPrescribeFromFirm(
  paymentOrderIssuedAt: Date | null,
  now: Date,
): boolean {
  if (paymentOrderIssuedAt === null) return false;
  return (
    now.getTime() >= prescriptionAvailableOn(paymentOrderIssuedAt).getTime()
  );
}
