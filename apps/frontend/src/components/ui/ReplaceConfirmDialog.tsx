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
// se reemplaza (por ejemplo, no escribir "quedara inactiva"). Sigue sin
// resolverse con el cliente el punto arquitectonico entre ADR-6 y RF-10
// (ver espacio SLO en Confluence) sobre que pasa exactamente con la
// liquidacion reemplazada. No agregues ese estado en el texto por tu cuenta
// hasta que ese ADR quede cerrado.
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
