import type {
  AcceptedStatusChange,
  AssistantProposals,
  AssistantSettlement,
  PaymentOrderFileRow,
  RejectedStatusChange,
} from "../api/assistant";
import type { PaymentOrderImportPreview } from "../api/paymentOrders";
import { formatCount } from "../utils/formatCount";
import type { SettlementStatus } from "./settlementStatus";

// How the panel reads what Slompsim answers (SL-156; design in Confluence
// "Diseño de Slompsim"). Pure.

// The limits of the assistant's endpoints (apps/backend/src/assistant).
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_CHANGES_PER_BATCH = 100;
const MAX_CONTEXT_ROWS = 5000;

// Rows a batch proposal shows; the rest are counted ("y 2 más").
export const PROPOSAL_ROWS_SHOWN = 10;

export interface Proposal {
  // What would change if applied.
  changes: AcceptedStatusChange[];
  // Already in the requested state: nothing to apply.
  unchanged: AcceptedStatusChange[];
  rejected: RejectedStatusChange[];
  note?: string;
  // Requested but over the limit of one batch.
  leftOut: number;
}

function byPropertyAndPeriod(
  a: AcceptedStatusChange,
  b: AcceptedStatusChange,
): number {
  return a.cadastralCode.localeCompare(b.cadastralCode) || a.period - b.period;
}

export function toProposal(
  { accepted, rejected, note }: AssistantProposals,
  leftOut = 0,
): Proposal {
  return {
    changes: accepted
      .filter(({ from, to }) => from !== to)
      .sort(byPropertyAndPeriod),
    unchanged: accepted.filter(({ from, to }) => from === to),
    rejected,
    note,
    leftOut,
  };
}

export type ProposalLevel = 1 | 2 | 3;

// Level of impact (section 4 of the design): it counts what would really
// change, never the model's text. 1: nothing to apply. 2: one change, a
// button. 3: a batch, with a checkbox before its button.
export function proposalLevel({ changes }: Proposal): ProposalLevel {
  if (changes.length === 0) return 1;
  return changes.length === 1 ? 2 : 3;
}

export function targetStatuses(
  changes: AcceptedStatusChange[],
): SettlementStatus[] {
  return [...new Set(changes.map(({ to }) => to))];
}

export function countProperties(
  rows: readonly { cadastralCode: string }[],
): number {
  return new Set(rows.map(({ cadastralCode }) => cadastralCode)).size;
}

// What a batch left behind: "2 predios" and the periods they cover.
export function appliedPeriods(applied: AcceptedStatusChange[]): number[] {
  return [...new Set(applied.map(({ period }) => period))].sort(
    (a, b) => a - b,
  );
}

// The states the rejected changes could all move to instead: the status
// buttons of a rejection card. Neither the state they are in nor the one
// just rejected is offered.
export function rejectedTargets(
  rejected: RejectedStatusChange[],
): SettlementStatus[] {
  const [first, ...rest] = rejected;
  if (!first) return [];
  return first.allowed.filter(
    (status) =>
      status !== first.to &&
      status !== first.current &&
      rest.every(
        (change) =>
          change.allowed.includes(status) && change.current !== status,
      ),
  );
}

// The periods the file leaves out that are worth asking about: the ones in no
// payment order and not paid. Any other state counts, a payment agreement or
// "Pérdida temporal de competencia" included.
export function pendingUnlisted(
  unlisted: AssistantSettlement[],
): AssistantSettlement[] {
  return unlisted.filter(
    ({ hasPaymentOrder, status }) => !hasPaymentOrder && status !== "PAGADA",
  );
}

// The state buttons of the chat that opens from the file, the default first.
const UNLISTED_TARGETS: SettlementStatus[] = [
  "PRESCRITA",
  "PAGADA",
  "ACUERDO_DE_PAGO",
];

export function unlistedTargets(
  rows: AssistantSettlement[],
): SettlementStatus[] {
  return UNLISTED_TARGETS.filter((status) =>
    rows.every(({ allowedStatuses }) => allowedStatuses.includes(status)),
  );
}

export interface PeriodGroup {
  cadastralCode: string;
  status: SettlementStatus;
  periods: number[];
}

// One line per property and state: "010000040021000, 2020–2021, En firme".
export function groupPeriods(rows: AssistantSettlement[]): PeriodGroup[] {
  const groups = new Map<string, PeriodGroup>();
  for (const { cadastralCode, status, period } of rows) {
    const key = `${cadastralCode}:${status}`;
    const group = groups.get(key) ?? { cadastralCode, status, periods: [] };
    group.periods.push(period);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      periods: [...group.periods].sort((a, b) => a - b),
    }))
    .sort((a, b) => a.cadastralCode.localeCompare(b.cadastralCode));
}

// The rows of the Excel that travel with the conversation, for the model's
// find_unlisted_periods. Only the properties with periods left out matter
// to it, which keeps a large file under the limit.
export function paymentOrderContextRows({
  eligible,
  ineligible,
  unlisted,
}: PaymentOrderImportPreview): PaymentOrderFileRow[] {
  const codes = new Set(unlisted.map(({ cadastralCode }) => cadastralCode));
  return [...eligible, ...ineligible]
    .filter(({ cadastralCode }) => codes.has(cadastralCode))
    .slice(0, MAX_CONTEXT_ROWS)
    .map(({ cadastralCode, period }) => ({ cadastralCode, period }));
}

// How many periods of how many properties, as the notice and the chat say it.
export function unlistedScope(rows: AssistantSettlement[]): {
  periods: string;
  properties: string;
} {
  return {
    periods: formatCount(rows.length, "periodo", "periodos"),
    properties: formatCount(countProperties(rows), "predio", "predios"),
  };
}
