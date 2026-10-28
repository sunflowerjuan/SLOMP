import { messageForPaymentOrderRejection } from "../../api/errorMessages";
import type { IneligiblePaymentOrderRow } from "../../api/paymentOrders";
import { IssueList } from "../../components/ui/IssueList";
import { groupIneligible } from "../../domain/paymentOrder";
import { formatPeriods } from "../../utils/formatPeriods";

// Each row is one period; the list groups them by property and reason.
const PERIOD = { singular: "periodo", plural: "periodos" };

// Periods of the Excel that can't get a payment order now, and why. Closed
// by default.
export function IneligiblePaymentOrderList({
  rows,
}: {
  rows: IneligiblePaymentOrderRow[];
}) {
  return (
    <IssueList title="No elegibles" count={rows.length} unit={PERIOD}>
      {groupIneligible(rows).map((group) => (
        <li
          key={`${group.cadastralCode}-${group.reason}-${group.firmOn ?? ""}`}
        >
          {group.cadastralCode} · {formatPeriods(group.periods)}:{" "}
          {messageForPaymentOrderRejection(group.reason, group.firmOn)}
        </li>
      ))}
    </IssueList>
  );
}
