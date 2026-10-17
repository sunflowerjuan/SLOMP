import type { IssuedPaymentOrder } from "../../api/paymentOrders";
import type { PaymentOrderCandidate } from "../../domain/paymentOrder";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatPeriods } from "../../utils/formatPeriods";
import "./PaymentOrderCandidateList.css";

interface PaymentOrderCandidateListProps {
  candidates: PaymentOrderCandidate[];
  // Issued from this screen, by cadastral code.
  issued: Record<string, IssuedPaymentOrder>;
  // A bulk job or another generation holds the numbers.
  locked: boolean;
  downloadingId: number | null;
  // Failed download of an order issued here, shown under its row.
  downloadError: { paymentOrderId: number; text: string } | null;
  onGenerate: (candidate: PaymentOrderCandidate) => void;
  onDownload: (order: IssuedPaymentOrder) => void;
}

// The properties of the Excel whose periods are "En firme": one payment order
// each. A row is "Listo para generar" until issued, then shows its number and
// PDF (payment orders have no status of their own).
export function PaymentOrderCandidateList({
  candidates,
  issued,
  locked,
  downloadingId,
  downloadError,
  onGenerate,
  onDownload,
}: PaymentOrderCandidateListProps) {
  if (candidates.length === 0) {
    return (
      <p className="payment-order-candidates__empty">
        No hay mandamientos por generar en este archivo.
      </p>
    );
  }

  return (
    <ul className="payment-order-candidates" aria-label="Listos para generar">
      {candidates.map((candidate) => {
        const order = issued[candidate.cadastralCode];
        return (
          <li key={candidate.cadastralCode}>
            <div className="payment-order-candidates__row">
              <div className="payment-order-candidates__info">
                <span className="payment-order-candidates__code">
                  {candidate.cadastralCode}
                </span>
                <span>{formatPeriods(candidate.periods)}</span>
              </div>
              {order ? (
                <div className="payment-order-candidates__actions">
                  <StatusBadge variant="success">MP-{order.number}</StatusBadge>
                  <Button
                    variant="secondary"
                    loading={downloadingId === order.paymentOrderId}
                    aria-label={`Descargar el PDF del mandamiento MP-${order.number}`}
                    onClick={() => onDownload(order)}
                  >
                    Descargar PDF
                  </Button>
                </div>
              ) : (
                <div className="payment-order-candidates__actions">
                  <StatusBadge variant="info">Listo para generar</StatusBadge>
                  <Button
                    variant="secondary"
                    disabled={locked}
                    aria-label={`Generar el mandamiento del predio ${candidate.cadastralCode}`}
                    onClick={() => onGenerate(candidate)}
                  >
                    Generar
                  </Button>
                </div>
              )}
            </div>
            {order &&
              downloadError?.paymentOrderId === order.paymentOrderId && (
                <Notice>{downloadError.text}</Notice>
              )}
          </li>
        );
      })}
    </ul>
  );
}
