import type {
  SettlementPeriodStatus,
  SettlementSearchResult,
} from "../../api/settlements";
import type { SettlementStatus } from "../../domain/settlementStatus";
import { describePeriods } from "../../utils/formatPeriods";
import { SettlementStatusCell } from "./SettlementStatusCell";
import "./SettlementPeriodList.css";

interface SettlementPeriodListProps {
  entry: SettlementSearchResult;
  editingId: number | null;
  savingId: number | null;
  onEdit: (settlementId: number) => void;
  onSave: (
    settlement: SettlementPeriodStatus,
    status: SettlementStatus,
  ) => void;
  onCancel: () => void;
}

// Each period with its own state: changing one leaves the others as they are.
export function SettlementPeriodList({
  entry,
  editingId,
  savingId,
  onEdit,
  onSave,
  onCancel,
}: SettlementPeriodListProps) {
  return (
    <ul className="settlement-periods">
      {entry.settlements.map((settlement) => (
        <li key={settlement.settlementId}>
          <span className="settlement-periods__year">{settlement.period}</span>
          <SettlementStatusCell
            status={settlement.status}
            allowedStatuses={settlement.allowedStatuses}
            description={`${entry.cadastralCode}, ${describePeriods([settlement.period])}`}
            editing={editingId === settlement.settlementId}
            saving={savingId === settlement.settlementId}
            editLocked={editingId !== null}
            onEdit={() => onEdit(settlement.settlementId)}
            onSave={(status) => onSave(settlement, status)}
            onCancel={onCancel}
          />
        </li>
      ))}
    </ul>
  );
}
