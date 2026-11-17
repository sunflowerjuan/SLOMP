import { useEffect, useState } from "react";
import { getAlertsSummary } from "../../api/alerts";
import type { AlertsSummary as Summary } from "../../api/alerts";
import { getErrorMessage } from "../../api/ApiError";
import { RetryNotice } from "../../components/ui/RetryNotice";
import { formatCount, formatNumber } from "../../utils/formatCount";
import "./AlertsSummary.css";

interface AlertsSummaryProps {
  // Changes when something that moves the counts happened (a status change).
  refreshKey: number;
}

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; summary: Summary };

// Two numbers over what the lawyer must look at (SL-132). It doesn't filter
// the search. The colored edge matches the row marks (SettlementMarks), and
// the figure always has its name beside it: color is never the only signal.
export function AlertsSummary({ refreshKey }: AlertsSummaryProps) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAlertsSummary()
      .then((summary) => {
        if (!cancelled) setState({ kind: "ready", summary });
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setState({ kind: "error", message: getErrorMessage(caught) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey, attempt]);

  // Between refreshes the last numbers stay: no flicker after a status change.
  if (state.kind === "error") {
    return (
      <RetryNotice onRetry={() => setAttempt((n) => n + 1)}>
        {state.message}
      </RetryNotice>
    );
  }

  if (state.kind === "loading") {
    return (
      <section
        className="alerts-summary alerts-summary--loading"
        aria-label="Resumen de alertas"
        aria-busy="true"
      >
        <p className="alerts-summary__empty">Cargando alertas…</p>
      </section>
    );
  }

  const { prescriptionRisk, missingPeriods } = state.summary;
  const none = prescriptionRisk.count === 0 && missingPeriods.count === 0;

  return (
    <section
      className="alerts-summary"
      aria-label="Resumen de alertas"
      aria-live="polite"
    >
      {none ? (
        <p className="alerts-summary__empty">Sin alertas</p>
      ) : (
        <dl className="alerts-summary__list">
          <div className="alerts-summary__item alerts-summary__item--risk">
            <dt>Riesgo de prescripción</dt>
            <dd>{formatNumber(prescriptionRisk.count)}</dd>
          </div>
          <div className="alerts-summary__item alerts-summary__item--missing">
            <dt>Periodos perdidos entre cargas</dt>
            <dd>{formatNumber(missingPeriods.count)}</dd>
            {missingPeriods.count > 0 && (
              <dd className="alerts-summary__detail">
                en {formatCount(missingPeriods.properties, "predio", "predios")}
              </dd>
            )}
          </div>
        </dl>
      )}
    </section>
  );
}
