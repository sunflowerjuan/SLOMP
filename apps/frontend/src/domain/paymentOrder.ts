import type {
  EligiblePaymentOrderRow,
  IneligiblePaymentOrderRow,
  PaymentOrderRejectionReason,
  PaymentOrderSummary,
} from "../api/paymentOrders";

// How the panel reads the payment orders Excel preview (SL-130). Pure.

// One payment order to generate: the backend issues one per property, covering
// all its eligible periods.
export interface PaymentOrderCandidate {
  cadastralCode: string;
  periods: number[];
  settlementIds: number[];
  // Resolutions the periods belong to (a property can have two: prescription
  // risk and normal collection).
  resolutionNumbers: string[];
}

export function groupEligibleByProperty(
  rows: EligiblePaymentOrderRow[],
): PaymentOrderCandidate[] {
  const byCode = new Map<string, EligiblePaymentOrderRow[]>();
  for (const row of rows) {
    byCode.set(row.cadastralCode, [
      ...(byCode.get(row.cadastralCode) ?? []),
      row,
    ]);
  }
  return [...byCode]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cadastralCode, group]) => {
      const sorted = [...group].sort((a, b) => a.period - b.period);
      return {
        cadastralCode,
        periods: sorted.map((row) => row.period),
        settlementIds: sorted.map((row) => row.settlementId),
        resolutionNumbers: [
          ...new Set(sorted.map((row) => row.resolutionNumber)),
        ],
      };
    });
}

// Newest first. The orders of one bulk job share their issue time, so the
// later id (the higher number) breaks the tie.
export function newestFirst(
  orders: PaymentOrderSummary[],
): PaymentOrderSummary[] {
  return [...orders].sort(
    (a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt) || b.id - a.id,
  );
}

// Periods of a candidate that came back in `rejected` when generating it:
// they stopped qualifying after the Excel was reviewed.
export function rejectedPeriods(
  candidate: PaymentOrderCandidate,
  rejected: { settlementId: number }[],
): number[] {
  const ids = new Set(rejected.map((entry) => entry.settlementId));
  return candidate.periods.filter((_, index) =>
    ids.has(candidate.settlementIds[index]),
  );
}

// Periods of one property that can't get a payment order for the same reason
// (and, if not yet firm, the same date), so the list reads one line each.
export interface IneligibleGroup {
  cadastralCode: string;
  periods: number[];
  reason: PaymentOrderRejectionReason;
  firmOn?: string;
}

export function groupIneligible(
  rows: IneligiblePaymentOrderRow[],
): IneligibleGroup[] {
  const groups = new Map<string, IneligibleGroup>();
  for (const row of rows) {
    const key = `${row.cadastralCode}|${row.reason}|${row.firmOn ?? ""}`;
    const group = groups.get(key);
    if (group) {
      group.periods.push(row.period);
    } else {
      groups.set(key, {
        cadastralCode: row.cadastralCode,
        periods: [row.period],
        reason: row.reason,
        ...(row.firmOn && { firmOn: row.firmOn }),
      });
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      periods: [...group.periods].sort((a, b) => a - b),
    }))
    .sort(
      (a, b) =>
        a.cadastralCode.localeCompare(b.cadastralCode) ||
        a.periods[0] - b.periods[0],
    );
}
