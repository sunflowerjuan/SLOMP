import { useEffect } from "react";
import type { SettlementSearchResult } from "../../api/settlements";
import { Button } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/CloseIcon";
import { Notice } from "../../components/ui/Notice";
import { useSwipeToDismiss } from "../../hooks/useSwipeToDismiss";
import { MEDIA } from "../../styles/breakpoints";
import { formatPeriods } from "../../utils/formatPeriods";
import { formatCop } from "../../utils/formatCop";
import { primaryMark } from "../../domain/settlementMarks";
import { SettlementMarks } from "./SettlementMarks";
import "./SettlementDetailSheet.css";

interface SettlementDetailSheetProps {
  id: string;
  open: boolean;
  entry: SettlementSearchResult | null;
  generating: boolean;
  // Why the last "Generar PDF" from the sheet failed.
  error: string | null;
  onClose: () => void;
  onGenerate: () => void;
}

// A long amount must not break the panel: step the size down with the length.
function amountSize(text: string): string {
  if (text.length > 18) return "var(--text-lg)";
  if (text.length > 14) return "var(--text-xl)";
  return "var(--text-3xl)";
}

// What the row of the list doesn't show: the header only says which
// liquidation this is, and its total, which the sheet covers or takes from the
// list.
export function SettlementDetailSheet({
  id,
  open,
  entry,
  generating,
  error,
  onClose,
  onGenerate,
}: SettlementDetailSheetProps) {
  // Phone: a bottom sheet that is also dismissed by dragging its header down.
  const { ref, bind } = useSwipeToDismiss<HTMLElement>(onClose, {
    axis: "y",
    media: MEDIA.shell,
  });
  // Opening moves focus into the panel; closing hands it back (see the page).
  useEffect(() => {
    if (open) ref.current?.focus({ preventScroll: true });
  }, [open, ref]);
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
        tabIndex={-1}
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
                <dt>Dirección</dt>
                <dd>{entry.address}</dd>
              </div>
              {entry.resolutionNumber && (
                <div>
                  <dt>Resolución</dt>
                  <dd>{entry.resolutionNumber}</dd>
                </div>
              )}
              {primaryMark(entry) && (
                <div>
                  <dt>Alertas</dt>
                  <dd>
                    <SettlementMarks entry={entry} />
                    {entry.missingPeriods.length > 0 && (
                      <p className="settlement-sheet__note">
                        {entry.missingPeriods.length === 1
                          ? "Este periodo venía en una carga anterior y no vino en la más reciente."
                          : "Estos periodos venían en una carga anterior y no vinieron en la más reciente."}{" "}
                        La alerta se quita al cambiar el estado o cuando vuelva
                        a aparecer en una carga.
                      </p>
                    )}
                  </dd>
                </div>
              )}
            </dl>
            {error && (
              <Notice className="settlement-sheet__notice">{error}</Notice>
            )}
            <Button
              fullWidth
              size="lg"
              loading={generating}
              onClick={onGenerate}
            >
              {error ? "Reintentar" : "Generar PDF"}
            </Button>
          </>
        )}
      </aside>
    </>
  );
}
