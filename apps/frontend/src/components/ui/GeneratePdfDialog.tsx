import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { Notice } from "./Notice";

interface GeneratePdfDialogProps {
  open: boolean;
  isGenerating?: boolean;
  error?: string | null;
  onCancel: () => void;
  onGenerate: () => void;
}

// The first PDF of a liquidation issues its resolution, which can't be
// undone, so it is confirmed. A liquidation with its resolution is generated
// from the sheet without asking.
export function GeneratePdfDialog({
  open,
  isGenerating = false,
  error = null,
  onCancel,
  onGenerate,
}: GeneratePdfDialogProps) {
  return (
    <Dialog
      open={open}
      title="Generar liquidación oficial"
      onClose={() => {
        if (!isGenerating) onCancel();
      }}
    >
      <div className="ui-dialog__body">
        <p>
          <strong>Esta acción no se puede deshacer.</strong> La liquidación
          recibirá el siguiente número de resolución y ese número queda usado.
        </p>
      </div>
      {error && <Notice className="ui-dialog__notice">{error}</Notice>}
      <div className="ui-dialog__actions">
        <Button variant="secondary" onClick={onCancel} disabled={isGenerating}>
          Cancelar
        </Button>
        <Button variant="primary" loading={isGenerating} onClick={onGenerate}>
          {error ? "Reintentar" : "Generar"}
        </Button>
      </div>
    </Dialog>
  );
}
