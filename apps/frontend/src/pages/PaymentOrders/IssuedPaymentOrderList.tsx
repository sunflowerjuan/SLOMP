import type { PaymentOrderSummary } from "../../api/paymentOrders";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Notice } from "../../components/ui/Notice";
import {
  filterByCadastralCode,
  paymentOrderNumberLabel,
} from "../../domain/paymentOrder";
import { formatPeriods } from "../../utils/formatPeriods";
import "./IssuedPaymentOrderList.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
});

interface IssuedPaymentOrderListProps {
  // null while the first load runs.
  orders: PaymentOrderSummary[] | null;
  // A cadastral code, or part of it, to narrow the list to.
  query: string;
  error: string;
  onRetry: () => void;
  downloadingId: number | null;
  downloadError: { paymentOrderId: number; text: string } | null;
  onDownload: (order: PaymentOrderSummary) => void;
}

// The municipality's payment orders, newest first, each with its PDF. The
// server sends the latest 100, so the search looks among those. The tab
// "Historial" names it.
export function IssuedPaymentOrderList({
  orders,
  query,
  error,
  onRetry,
  downloadingId,
  downloadError,
  onDownload,
}: IssuedPaymentOrderListProps) {
  const found = orders && filterByCadastralCode(orders, query);

  return (
    <Card label="Mandamientos emitidos" className="issued-payment-orders">
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
          Aún no se han generado mandamientos.
        </p>
      )}

      {orders && orders.length > 0 && found?.length === 0 && (
        <p className="issued-payment-orders__muted" role="status">
          Ningún mandamiento del historial es de esa cédula catastral.
        </p>
      )}

      {found && found.length > 0 && (
        <ul className="issued-payment-orders__list">
          {found.map((order) => (
            <li key={order.id}>
              <div className="issued-payment-orders__row">
                <div className="issued-payment-orders__info">
                  <strong>{paymentOrderNumberLabel(order.number)}</strong>
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
                  aria-label={`Descargar el PDF del mandamiento ${paymentOrderNumberLabel(order.number)}`}
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
