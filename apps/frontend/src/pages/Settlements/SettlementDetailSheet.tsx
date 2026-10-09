import type { SettlementSearchResult } from "../../api/settlements";
import type { SettlementStatus } from "../../domain/settlementStatus";
import { Button } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/CloseIcon";
import { useSwipeToDismiss } from "../../hooks/useSwipeToDismiss";
import { formatPeriods } from "../../utils/formatPeriods";
import { formatCop } from "./formatCop";
import { SettlementStatusCell } from "./SettlementStatusCell";
import "./SettlementDetailSheet.css";

interface SettlementDetailSheetProps {
  id: string;
  open: boolean;
  entry: SettlementSearchResult | null;
  editing: boolean;
  editLocked: boolean;
  saving: boolean;
  onEdit: () => void;
  onSave: (status: SettlementStatus) => void;
  onCancel: () => void;
  onClose: () => void;
  onGenerate: () => void;
}

// A long amount must not break the panel: step the size down with the length.
function amountSize(text: string): string {
  if (text.length > 18) return "var(--text-lg)";
  if (text.length > 14) return "var(--text-xl)";
  return "var(--text-3xl)";
}

export function SettlementDetailSheet({
  id,
  open,
  entry,
  editing,
  editLocked,
  saving,
  onEdit,
  onSave,
  onCancel,
  onClose,
  onGenerate,
}: SettlementDetailSheetProps) {
  // Phone: a bottom sheet that is also dismissed by dragging its header down.
  const { ref, bind } = useSwipeToDismiss<HTMLElement>(onClose, {
    axis: "y",
    media: "(max-width: 900px)",
  });
  const periods = entry ? formatPeriods(entry.periods) : "";
  const total = entry ? formatCop(entry.totalAmount) : "";

  return (
    <>
      {/* Below the wide layout the panel covers the list: dim it, and a tap
          outside closes the panel. */}
      <div
        className="settlement-sheet__scrim"
        data-open={open}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={ref}
        id={id}
        className="settlement-sheet"
        data-open={open}
        aria-label="Detalle de la liquidación"
        inert={!open}
      >
        {entry && (
          <>
            <header className="settlement-sheet__header" {...bind}>
              <div>
                <h2 className="settlement-sheet__title">
                  Liquidación {periods}
                </h2>
                <p
                  className="settlement-sheet__amount"
                  style={{ fontSize: amountSize(total) }}
                >
                  {total}
                </p>
              </div>
              <button
                type="button"
                className="settlement-sheet__close"
                aria-label="Cerrar detalle"
                onClick={onClose}
              >
                <CloseIcon />
              </button>
            </header>
            <dl className="settlement-sheet__details">
              <div>
                <dt>Estado</dt>
                <dd>
                  <SettlementStatusCell
                    status={entry.status}
                    description={`${entry.cadastralCode}, periodos ${periods}`}
                    editing={editing}
                    saving={saving}
                    editLocked={editLocked}
                    onEdit={onEdit}
                    onSave={onSave}
                    onCancel={onCancel}
                  />
                </dd>
              </div>
              {entry.resolutionNumber && (
                <div>
                  <dt>Resolución</dt>
                  <dd>{entry.resolutionNumber}</dd>
                </div>
              )}
              <div>
                <dt>Propietario</dt>
                <dd>{entry.ownerName}</dd>
              </div>
              <div>
                <dt>Cédula catastral</dt>
                <dd>{entry.cadastralCode}</dd>
              </div>
              <div>
                <dt>Dirección</dt>
                <dd>{entry.address}</dd>
              </div>
            </dl>
            <Button fullWidth size="lg" onClick={onGenerate}>
              Generar PDF
            </Button>
          </>
        )}
      </aside>
    </>
  );
}
