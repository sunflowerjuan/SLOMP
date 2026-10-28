import type {
  EligiblePaymentOrderRow,
  IneligiblePaymentOrderRow,
  PaymentOrderRejectionReason,
  PaymentOrderSummary,
} from "../api/paymentOrders";
import { formatCount } from "../utils/formatCount";

// How the panel reads the payment orders Excel preview (SL-130). Pure.

// What the panel puts before a payment order number. Empty: the number as the
// system keeps it ("2026-0001"). If the panel must show the prefix the PDF
// prints, it goes here; the downloaded file's name doesn't use it.
const PAYMENT_ORDER_NUMBER_PREFIX = "";

export function paymentOrderNumberLabel(number: string): string {
  return `${PAYMENT_ORDER_NUMBER_PREFIX}${number}`;
}

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

// The step "Revisar" in one line: "12 predios, 37 periodos elegibles, 5 no
// elegibles". Predios counts every property of the file that has a valid row.
export function reviewSummary(preview: {
  eligible: { cadastralCode: string }[];
  ineligible: { cadastralCode: string }[];
}): string {
  const properties = new Set(
    [...preview.eligible, ...preview.ineligible].map(
      (row) => row.cadastralCode,
    ),
  ).size;
  return [
    formatCount(properties, "predio", "predios"),
    formatCount(
      preview.eligible.length,
      "periodo elegible",
      "periodos elegibles",
    ),
    formatCount(preview.ineligible.length, "no elegible", "no elegibles"),
  ].join(", ");
}

// The order the reasons are listed in: the ones that clear up with time
// first, then the ones that won't.
const REASON_ORDER: PaymentOrderRejectionReason[] = [
  "NOT_YET_FIRM",
  "NO_RESOLUTION",
  "ALREADY_HAS_PAYMENT_ORDER",
  "STATUS_NOT_ELIGIBLE",
  "SETTLEMENT_REPLACED",
  "SETTLEMENT_NOT_FOUND",
];

export interface IneligibleReasonGroup {
  reason: PaymentOrderRejectionReason;
  // How many periods of the file have this reason.
  periods: number;
  groups: IneligibleGroup[];
}

// The ineligible periods by reason, each reason with its properties.
export function groupIneligibleByReason(
  rows: IneligiblePaymentOrderRow[],
): IneligibleReasonGroup[] {
  const groups = groupIneligible(rows);
  return REASON_ORDER.map((reason) => ({
    reason,
    periods: rows.filter((row) => row.reason === reason).length,
    groups: groups.filter((group) => group.reason === reason),
  })).filter((entry) => entry.periods > 0);
}

// A payment order issued from this screen, with the row it was issued for.
// Once issued, its property no longer comes back as eligible when the same
// Excel is reviewed again, so the row is kept here to show its number.
export interface IssuedCandidate {
  candidate: PaymentOrderCandidate;
  paymentOrderId: number;
  number: string;
}

// The rows of the step "Generar": what the Excel still offers plus what was
// issued from it, by cadastral code.
export function generationRows(
  candidates: PaymentOrderCandidate[],
  issued: Record<string, IssuedCandidate>,
): PaymentOrderCandidate[] {
  const byCode = new Map(
    Object.values(issued).map((entry) => [
      entry.candidate.cadastralCode,
      entry.candidate,
    ]),
  );
  for (const candidate of candidates) {
    if (!byCode.has(candidate.cadastralCode)) {
      byCode.set(candidate.cadastralCode, candidate);
    }
  }
  return [...byCode.values()].sort((a, b) =>
    a.cadastralCode.localeCompare(b.cadastralCode),
  );
}

// After a ZIP: the candidates that got a payment order, found in the issued
// list by the settlements it covers.
export function issuedFromOrders(
  candidates: PaymentOrderCandidate[],
  orders: PaymentOrderSummary[],
): Record<string, IssuedCandidate> {
  const issued: Record<string, IssuedCandidate> = {};
  for (const candidate of candidates) {
    const ids = new Set(candidate.settlementIds);
    const order = orders.find(
      (entry) =>
        entry.cadastralCode === candidate.cadastralCode &&
        entry.settlementIds.some((id) => ids.has(id)),
    );
    if (order) {
      issued[candidate.cadastralCode] = {
        candidate,
        paymentOrderId: order.id,
        number: order.number,
      };
    }
  }
  return issued;
}

// The history search: a cadastral code, or part of it, with or without its
// separators.
export function filterByCadastralCode(
  orders: PaymentOrderSummary[],
  query: string,
): PaymentOrderSummary[] {
  const digits = query.replace(/\D/g, "");
  if (!digits) return orders;
  return orders.filter((order) =>
    order.cadastralCode.replace(/\D/g, "").includes(digits),
  );
}
