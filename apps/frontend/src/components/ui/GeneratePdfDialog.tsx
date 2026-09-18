import { useEffect, useId } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Button } from "./Button";
import "./GeneratePdfDialog.css";

interface LiquidacionSummary {
  cedulaCatastral: string;
  propietario: string;
}

interface GeneratePdfDialogProps {
  open: boolean;
  liquidacion: LiquidacionSummary | null;
  isGenerating?: boolean;
  onCancel: () => void;
  onGenerate: () => void;
}

export function GeneratePdfDialog({
  open,
  liquidacion,
  isGenerating = false,
  onCancel,
  onGenerate,
}: GeneratePdfDialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open || !liquidacion) {
    return null;
  }

  function handleOverlayClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onCancel();
    }
  }

  return (
    <div
      className="ui-generate-pdf-dialog__overlay"
      onClick={handleOverlayClick}
    >
      <div
        className="ui-generate-pdf-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 className="ui-generate-pdf-dialog__title" id={titleId}>
          Generar liquidación oficial
        </h2>
        <div className="ui-generate-pdf-dialog__body">
          <p className="ui-generate-pdf-dialog__detail">
            <strong>Cédula catastral:</strong> {liquidacion.cedulaCatastral}
          </p>
          <p className="ui-generate-pdf-dialog__detail">
            <strong>Propietario:</strong> {liquidacion.propietario}
          </p>
        </div>
        <div className="ui-generate-pdf-dialog__actions">
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" loading={isGenerating} onClick={onGenerate}>
            Generar PDF
          </Button>
        </div>
      </div>
    </div>
  );
}
