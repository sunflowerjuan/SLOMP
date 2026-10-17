import type { PaymentOrderSummary } from "../../api/paymentOrders";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Notice } from "../../components/ui/Notice";
import { formatPeriods } from "../../utils/formatPeriods";
import "./IssuedPaymentOrderList.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
});

interface IssuedPaymentOrderListProps {
  // null while the first load runs.
  orders: PaymentOrderSummary[] | null;
  error: string;
  onRetry: () => void;
  downloadingId: number | null;
  downloadError: { paymentOrderId: number; text: string } | null;
  onDownload: (order: PaymentOrderSummary) => void;
}

// The municipality's payment orders, newest first, each with its PDF.
export function IssuedPaymentOrderList({
  orders,
  error,
  onRetry,
  downloadingId,
  downloadError,
  onDownload,
}: IssuedPaymentOrderListProps) {
  return (
    <Card
      title="Mandamientos generados"
      subtitle="Los 100 más recientes."
      className="issued-payment-orders"
    >
      {error && (
        <Notice className="issued-payment-orders__retry">
          {error}
          <Button variant="secondary" onClick={onRetry}>
            Reintentar
          </Button>
        </Notice>
      )}

      {orders === null && !error && (
        <ul
          className="issued-payment-orders__list"
          role="status"
          aria-label="Cargando mandamientos"
        >
          {[0, 1].map((row) => (
            <li
              key={row}
              className="issued-payment-orders__skeleton"
              aria-hidden="true"
            >
              <div>
                <i />
                <i />
              </div>
            </li>
          ))}
        </ul>
      )}

      {orders?.length === 0 && (
        <p className="issued-payment-orders__muted">
          Todavía no se ha generado ningún mandamiento.
        </p>
      )}

      {orders && orders.length > 0 && (
        <ul className="issued-payment-orders__list">
          {orders.map((order) => (
            <li key={order.id}>
              <div className="issued-payment-orders__row">
                <div className="issued-payment-orders__info">
                  <strong>MP-{order.number}</strong>
                  <span className="issued-payment-orders__code">
                    {order.cadastralCode}
                  </span>
                  <span>
                    {formatPeriods(order.periods)} ·{" "}
                    {DATE_FORMATTER.format(new Date(order.issuedAt))}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  loading={downloadingId === order.id}
                  aria-label={`Descargar el PDF del mandamiento MP-${order.number}`}
                  onClick={() => onDownload(order)}
                >
                  Descargar PDF
                </Button>
              </div>
              {downloadError?.paymentOrderId === order.id && (
                <Notice>{downloadError.text}</Notice>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
