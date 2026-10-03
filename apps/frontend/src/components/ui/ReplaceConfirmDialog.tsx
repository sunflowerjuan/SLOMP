import { useId } from "react";
import { Button } from "./Button";
import "./ReplaceConfirmDialog.css";

interface ReplaceConfirmDialogProps {
  open: boolean;
  isConfirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// This dialog's copy must NOT say which state the settlement being replaced
// moves to. "Inactiva" doesn't exist as a state -- the replacement doesn't
// change the status (the 4 real states), it only marks replacedAt. The real
// archive of replaced settlements isn't implemented yet -- that's why the
// copy still avoids promising a place to look it up afterward.
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
