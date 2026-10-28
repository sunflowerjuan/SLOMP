import { paymentOrderNumberLabel } from "../../domain/paymentOrder";
import type {
  IssuedCandidate,
  PaymentOrderCandidate,
} from "../../domain/paymentOrder";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatPeriods } from "../../utils/formatPeriods";
import "./PaymentOrderCandidateList.css";

interface CandidateGeneration {
  // Issued from this screen, by cadastral code.
  issued: Record<string, IssuedCandidate>;
  // A bulk job or another generation holds the numbers.
  locked: boolean;
  downloadingId: number | null;
  // Failed download of an order issued here, shown under its row.
  downloadError: { paymentOrderId: number; text: string } | null;
  onGenerate: (candidate: PaymentOrderCandidate) => void;
  onDownload: (order: IssuedCandidate) => void;
}

interface PaymentOrderCandidateListProps {
  candidates: PaymentOrderCandidate[];
  // Names the list for screen readers.
  label: string;
  // The step "Generar" only: each row's button, or its number and PDF once
  // issued. Without it the rows are only listed (step "Revisar").
  generation?: CandidateGeneration;
}

// The properties of the Excel whose periods are "En firme": one payment order
// each (payment orders have no status of their own).
export function PaymentOrderCandidateList({
  candidates,
  label,
  generation,
}: PaymentOrderCandidateListProps) {
  if (candidates.length === 0) {
    return (
      <p className="payment-order-candidates__empty">
        No hay mandamientos por generar en este archivo.
      </p>
    );
  }

  return (
    <ul className="payment-order-candidates" aria-label={label}>
      {candidates.map((candidate) => {
        const order = generation?.issued[candidate.cadastralCode];
        return (
          <li key={candidate.cadastralCode}>
            <div className="payment-order-candidates__row">
              <div className="payment-order-candidates__info">
                <span className="payment-order-candidates__code">
                  {candidate.cadastralCode}
                </span>
                <span>{formatPeriods(candidate.periods)}</span>
              </div>
              {generation && order && (
                <div className="payment-order-candidates__actions">
                  <StatusBadge variant="success">
                    {paymentOrderNumberLabel(order.number)}
                  </StatusBadge>
                  <Button
                    variant="secondary"
                    loading={generation.downloadingId === order.paymentOrderId}
                    aria-label={`Descargar el PDF del mandamiento ${paymentOrderNumberLabel(order.number)}`}
                    onClick={() => generation.onDownload(order)}
                  >
                    Descargar PDF
                  </Button>
                </div>
              )}
              {generation && !order && (
                <div className="payment-order-candidates__actions">
                  <Button
                    variant="secondary"
                    disabled={generation.locked}
                    aria-label={`Generar el mandamiento del predio ${candidate.cadastralCode}`}
                    onClick={() => generation.onGenerate(candidate)}
                  >
                    Generar
                  </Button>
                </div>
              )}
            </div>
            {order &&
              generation?.downloadError?.paymentOrderId ===
                order.paymentOrderId && (
                <Notice>{generation.downloadError.text}</Notice>
              )}
          </li>
        );
      })}
    </ul>
  );
}
