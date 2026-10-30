import type { TemplateVersion } from "../../api/templates";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Notice } from "../../components/ui/Notice";

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "long",
  timeStyle: "short",
});

interface ReplaceTemplateDialogProps {
  // The version in use that the new one replaces; null keeps it closed.
  active: TemplateVersion | null;
  // "liquidación" or "mandamiento".
  documentName: string;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}

// Saving over an active version always asks first and says what happens to
// it: it stops being used, but it is kept and can be activated again.
export function ReplaceTemplateDialog({
  active,
  documentName,
  saving,
  error,
  onCancel,
  onConfirm,
}: ReplaceTemplateDialogProps) {
  return (
    <Dialog
      open={active !== null}
      title={`¿Reemplazar la plantilla de ${documentName} en uso?`}
      onClose={() => {
        if (!saving) onCancel();
      }}
    >
      {active && (
        <div className="ui-dialog__body">
          <p>
            La <strong>versión {active.version}</strong> (
            <span className="templates-page__file">{active.fileName}</span>,
            subida el {DATE_FORMATTER.format(new Date(active.createdAt))})
            dejará de usarse: los próximos PDF de {documentName} usarán la
            plantilla nueva.
          </p>
          <p>
            La versión {active.version} se conserva como versión anterior y
            puedes volver a activarla desde Versiones cuando quieras.
          </p>
        </div>
      )}
      {error && <Notice className="ui-dialog__notice">{error}</Notice>}
      <div className="ui-dialog__actions">
        <Button variant="secondary" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
        <Button loading={saving} onClick={onConfirm}>
          Reemplazar plantilla
        </Button>
      </div>
    </Dialog>
  );
}

interface DiscardDraftDialogProps {
  open: boolean;
  // Markers the lawyer assigned and table rows removed, which are lost.
  assigned: number;
  removedRows: number;
  discarding: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}

export function DiscardDraftDialog({
  open,
  assigned,
  removedRows,
  discarding,
  onKeep,
  onDiscard,
}: DiscardDraftDialogProps) {
  return (
    <Dialog
      open={open}
      title="¿Descartar este borrador?"
      onClose={() => {
        if (!discarding) onKeep();
      }}
    >
      <div className="ui-dialog__body">
        <p>
          Se perderán{" "}
          {[
            assigned === 1
              ? "el marcador que asignaste"
              : assigned > 1
                ? `los ${assigned} marcadores que asignaste`
                : "",
            removedRows === 1
              ? "la fila que quitaste"
              : removedRows > 1
                ? `las ${removedRows} filas que quitaste`
                : "",
          ]
            .filter(Boolean)
            .join(" y ")}
          . La plantilla en uso no cambia.
        </p>
      </div>
      <div className="ui-dialog__actions">
        <Button variant="secondary" disabled={discarding} onClick={onKeep}>
          Seguir marcando
        </Button>
        <Button variant="danger" loading={discarding} onClick={onDiscard}>
          Descartar borrador
        </Button>
      </div>
    </Dialog>
  );
}
