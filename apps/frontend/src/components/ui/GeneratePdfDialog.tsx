import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Notice } from "./Notice";

interface LiquidacionSummary {
  cedulaCatastral: string;
  propietario: string;
}

interface GeneratePdfDialogProps {
  open: boolean;
  liquidacion: LiquidacionSummary | null;
  isGenerating?: boolean;
  error?: string | null;
  onCancel: () => void;
  onGenerate: () => void;
}

export function GeneratePdfDialog({
  open,
  liquidacion,
  isGenerating = false,
  error = null,
  onCancel,
  onGenerate,
}: GeneratePdfDialogProps) {
  return (
    <Dialog
      open={open && liquidacion !== null}
      title="Generar liquidación oficial"
      onClose={() => {
        if (!isGenerating) onCancel();
      }}
    >
      <div className="ui-dialog__body">
        <p>
          <strong>Cédula catastral:</strong> {liquidacion?.cedulaCatastral}
        </p>
        <p>
          <strong>Propietario:</strong> {liquidacion?.propietario}
        </p>
      </div>
      {error && <Notice className="ui-dialog__notice">{error}</Notice>}
      <div className="ui-dialog__actions">
        <Button variant="secondary" onClick={onCancel} disabled={isGenerating}>
          Cancelar
        </Button>
        <Button variant="primary" loading={isGenerating} onClick={onGenerate}>
          Generar PDF
        </Button>
      </div>
    </Dialog>
  );
}
