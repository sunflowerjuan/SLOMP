import { messageForPaymentOrderRejection } from "../../api/errorMessages";
import type { IneligiblePaymentOrderRow } from "../../api/paymentOrders";
import { Card } from "../../components/ui/Card";
import { groupIneligibleByReason } from "../../domain/paymentOrder";
import { formatCount } from "../../utils/formatCount";
import { formatPeriods } from "../../utils/formatPeriods";
import "./IneligiblePaymentOrderList.css";

// Periods of the Excel that can't get a payment order now, by reason; each
// reason folds its properties away. The step's summary already says how many
// there are, so the card doesn't repeat it.
export function IneligiblePaymentOrderList({
  rows,
}: {
  rows: IneligiblePaymentOrderRow[];
}) {
  const reasons = groupIneligibleByReason(rows);
  if (reasons.length === 0) return null;

  return (
    <Card title="No elegibles" className="payment-order-ineligible">
      {reasons.map(({ reason, periods, groups }) => (
        <details key={reason} className="payment-order-ineligible__reason">
          <summary>
            {messageForPaymentOrderRejection(reason).replace(/\.$/, "")} (
            {formatCount(periods, "periodo", "periodos")})
          </summary>
          <ul>
            {groups.map((group) => (
              <li key={`${group.cadastralCode}-${group.firmOn ?? ""}`}>
                <span className="payment-order-ineligible__code">
                  {group.cadastralCode}
                </span>{" "}
                · {formatPeriods(group.periods)}
                {group.firmOn &&
                  ` · ${messageForPaymentOrderRejection(reason, group.firmOn)}`}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </Card>
  );
}
