import { messageForPaymentOrderRejection } from "../../api/errorMessages";
import type { IneligiblePaymentOrderRow } from "../../api/paymentOrders";
import { groupIneligible } from "../../domain/paymentOrder";
import { formatPeriods } from "../../utils/formatPeriods";
// Same collapsed list as the row problems of the upload.
import "../TaxRollUpload/TaxRollIssueList.css";

// Periods of the Excel that can't get a payment order now, and why. Closed
// by default.
export function IneligiblePaymentOrderList({
  rows,
}: {
  rows: IneligiblePaymentOrderRow[];
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <details className="tax-roll-upload-page__issues">
      <summary>No elegibles ({rows.length})</summary>
      <ul>
        {groupIneligible(rows).map((group) => (
          <li
            key={`${group.cadastralCode}-${group.reason}-${group.firmOn ?? ""}`}
          >
            {group.cadastralCode} · {formatPeriods(group.periods)}:{" "}
            {messageForPaymentOrderRejection(group.reason, group.firmOn)}
          </li>
        ))}
      </ul>
    </details>
  );
}
