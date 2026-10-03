import { useId } from "react";
import { Button } from "./Button";
import "./ReplaceConfirmDialog.css";

interface ReplaceConfirmDialogProps {
  open: boolean;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// El copy de este dialogo NO debe decir a que estado pasa la liquidacion que
// se reemplaza. "Inactiva" no existe como estado -- el reemplazo no cambia
// el status (los 4 del ERS), solo marca replacedAt. El archivo real de
// reemplazadas todavia no esta implementado -- por eso el copy sigue sin
// prometer un lugar donde consultarla despues.
export function ReplaceConfirmDialog({
  open,
  isConfirming = false,
  onCancel,
  onConfirm,
}: ReplaceConfirmDialogProps) {
  const titleId = useId();

  if (!open) {
    return null;
  }

  return (
    <div className="ui-replace-dialog__overlay">
      <div
        className="ui-replace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 className="ui-replace-dialog__title" id={titleId}>
          Ya existe una liquidación para este predio y periodo
        </h2>
        <p className="ui-replace-dialog__body">
          Si continúas, la liquidación actual se reemplazará por la nueva
          información del Excel. Esta acción no se puede deshacer desde aquí.
        </p>
        <div className="ui-replace-dialog__actions">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger" loading={isConfirming} onClick={onConfirm}>
            Reemplazar liquidación
          </Button>
        </div>
      </div>
    </div>
  );
}
