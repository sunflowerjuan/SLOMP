import type {
  SettlementPeriodStatus,
  SettlementSearchResult,
} from "../api/settlements";
import type { SettlementStatus } from "./settlementStatus";

interface PeriodChange {
  settlementId: number;
  status: SettlementStatus;
  allowedStatuses: SettlementStatus[];
  missingPeriods: number[];
}

function groupStatus(
  settlements: SettlementPeriodStatus[],
): SettlementSearchResult["status"] {
  const [first, ...rest] = settlements;
  return rest.every(({ status }) => status === first.status)
    ? first.status
    : "MIXED";
}

// A row after one of its periods changed state: the others keep theirs, and
// the row says "MIXED" when they end up different, as the backend's search.
export function withPeriodChanged(
  entry: SettlementSearchResult,
  { settlementId, status, allowedStatuses, missingPeriods }: PeriodChange,
): SettlementSearchResult {
  const settlements = entry.settlements.map((settlement) =>
    settlement.settlementId === settlementId
      ? { ...settlement, status, allowedStatuses }
      : settlement,
  );
  return {
    ...entry,
    settlements,
    status: groupStatus(settlements),
    missingPeriods,
  };
}
