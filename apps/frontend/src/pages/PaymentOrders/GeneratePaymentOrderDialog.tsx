import type { PaymentOrderCandidate } from "../../domain/paymentOrder";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Notice } from "../../components/ui/Notice";
import { formatPeriods } from "../../utils/formatPeriods";

interface GeneratePaymentOrderDialogProps {
  candidate: PaymentOrderCandidate | null;
  isGenerating: boolean;
  error: string | null;
  onCancel: () => void;
  onGenerate: () => void;
}

// Issuing takes the next payment order number and can't be undone, so it is
// confirmed first.
export function GeneratePaymentOrderDialog({
  candidate,
  isGenerating,
  error,
  onCancel,
  onGenerate,
}: GeneratePaymentOrderDialogProps) {
  return (
    <Dialog
      open={candidate !== null}
      title="Generar mandamiento"
      onClose={() => {
        if (!isGenerating) onCancel();
      }}
    >
      <div className="ui-dialog__body">
        <p>
          <strong>Cédula catastral:</strong> {candidate?.cadastralCode}
        </p>
        <p>
          <strong>
            {candidate?.periods.length === 1 ? "Periodo:" : "Periodos:"}
          </strong>{" "}
          {candidate && formatPeriods(candidate.periods)}
        </p>
        <p>
          <strong>
            {candidate?.resolutionNumbers.length === 1
              ? "Resolución:"
              : "Resoluciones:"}
          </strong>{" "}
          {candidate?.resolutionNumbers.join(", ")}
        </p>
        <p>Recibirá el siguiente número de mandamiento.</p>
      </div>
      {error && <Notice className="ui-dialog__notice">{error}</Notice>}
      <div className="ui-dialog__actions">
        <Button variant="secondary" onClick={onCancel} disabled={isGenerating}>
          Cancelar
        </Button>
        <Button loading={isGenerating} onClick={onGenerate}>
          Generar
        </Button>
      </div>
    </Dialog>
  );
}
