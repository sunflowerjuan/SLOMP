import type {
  AcceptedStatusChange,
  RejectedStatusChange,
} from "../api/assistant";
import {
  statusChangeRejectionMessage,
  statusChangeRejectionTitle,
} from "../api/errorMessages";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { SETTLEMENT_STATUS_LABEL } from "../domain/settlementStatus";
import type { SettlementStatus } from "../domain/settlementStatus";
import {
  appliedPeriods,
  countProperties,
  rejectedTargets,
  targetStatuses,
} from "../domain/slompsim";
import { useFocusOnMount } from "../hooks/useFocusOnMount";
import { countNoun, formatCount } from "../utils/formatCount";
import { describePeriods } from "../utils/formatPeriods";
import "./SlompsimCards.css";

const TIME_ZONE = "America/Bogota";

const APPLIED_DATE = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const APPLIED_TIME = new Intl.DateTimeFormat("es-CO", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

function AlertIcon() {
  return (
    <Icon box={24}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5.5M12 16.5h.01" />
    </Icon>
  );
}

interface AppliedCardProps {
  applied: AcceptedStatusChange[];
  // ISO date of the moment it was applied.
  at: string;
  onSeeSettlements: () => void;
}

export function AppliedCard({
  applied,
  at,
  onSeeSettlements,
}: AppliedCardProps) {
  const cardRef = useFocusOnMount<HTMLElement>();
  const count = applied.length;
  const date = new Date(at);
  const targets = targetStatuses(applied)
    .map((status) => SETTLEMENT_STATUS_LABEL[status])
    .join(", ");

  return (
    <section
      ref={cardRef}
      className="slompsim-card slompsim-card--done"
      role="status"
      tabIndex={-1}
    >
      <h3 className="slompsim-card__title">
        <Icon box={24}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12.5l2.7 2.7L16 10" />
        </Icon>
        {count === 1
          ? "Se aplicó 1 cambio"
          : `Se aplicaron ${formatCount(count, "cambio", "cambios")}`}
      </h3>
      {count === 0 ? (
        <p className="slompsim-card__text">
          Ya estaban en ese estado: no hubo nada que cambiar.
        </p>
      ) : (
        <>
          <p className="slompsim-card__text">
            {formatCount(countProperties(applied), "predio", "predios")},{" "}
            {describePeriods(appliedPeriods(applied))}. Ahora{" "}
            {countNoun(count, "está", "están")} en <strong>{targets}</strong>.
          </p>
          <p className="slompsim-card__text">
            {countNoun(count, "Quedó registrado", "Quedaron registrados")} a tu
            nombre el {APPLIED_DATE.format(date)} a las{" "}
            {APPLIED_TIME.format(date)}.
          </p>
        </>
      )}
      <div className="slompsim-card__actions">
        <Button variant="secondary" onClick={onSeeSettlements}>
          Ver en Liquidaciones
        </Button>
      </div>
    </section>
  );
}

function rejectionLine(
  rejected: RejectedStatusChange,
  municipalityName: string,
): string {
  return `${statusChangeRejectionTitle(rejected)}. ${statusChangeRejectionMessage(rejected, municipalityName)}`;
}

function RejectedList({
  rejected,
  municipalityName,
}: {
  rejected: RejectedStatusChange[];
  municipalityName: string;
}) {
  return (
    <ul className="slompsim-card__list">
      {rejected.map((change) => (
        <li key={change.settlementId}>
          {rejectionLine(change, municipalityName)}
        </li>
      ))}
    </ul>
  );
}

interface RejectedCardProps {
  rejected: RejectedStatusChange[];
  municipalityName: string;
  busy: boolean;
  // Absent when the rejected ones only go along with a proposal.
  onPick?: (status: SettlementStatus) => void;
}

export function RejectedCard({
  rejected,
  municipalityName,
  busy,
  onPick,
}: RejectedCardProps) {
  const [first] = rejected;
  const single = rejected.length === 1;
  const targets = onPick ? rejectedTargets(rejected) : [];
  const verb = onPick ? "pueden aplicar" : "aplicarán";

  return (
    <section className="slompsim-card slompsim-card--rejected" role="alert">
      <h3 className="slompsim-card__title">
        <AlertIcon />
        {single
          ? statusChangeRejectionTitle(first)
          : `No se ${verb} ${formatCount(rejected.length, "cambio", "cambios")}`}
      </h3>
      {single ? (
        <p className="slompsim-card__text">
          {statusChangeRejectionMessage(first, municipalityName)}
        </p>
      ) : (
        <RejectedList rejected={rejected} municipalityName={municipalityName} />
      )}
      {targets.length > 0 && (
        <>
          <p className="slompsim-card__text">
            <strong>{single ? "Puede pasar a:" : "Pueden pasar a:"}</strong>
          </p>
          <div className="slompsim-card__actions slompsim-card__actions--states">
            {targets.map((status) => (
              <Button
                key={status}
                variant="secondary"
                disabled={busy}
                onClick={() => onPick?.(status)}
              >
                {SETTLEMENT_STATUS_LABEL[status]}
              </Button>
            ))}
          </div>
        </>
      )}
      {onPick && (
        <p className="slompsim-card__hint">
          {targets.length > 0
            ? "Elige uno para preparar el cambio. Nada cambió."
            : "Nada cambió."}
        </p>
      )}
    </section>
  );
}

interface ConflictCardProps {
  message: string;
  rejected: RejectedStatusChange[];
  municipalityName: string;
  busy: boolean;
  // Absent once a newer proposal took its place.
  onReview?: () => void;
}

// Something changed between the proposal and "Aplicar": nothing was applied
// and it has to be confirmed again.
export function ConflictCard({
  message,
  rejected,
  municipalityName,
  busy,
  onReview,
}: ConflictCardProps) {
  const cardRef = useFocusOnMount<HTMLElement>();
  return (
    <section
      ref={cardRef}
      className="slompsim-card slompsim-card--rejected"
      role="alert"
      tabIndex={-1}
    >
      <h3 className="slompsim-card__title">
        <AlertIcon />
        {message}
      </h3>
      <RejectedList rejected={rejected} municipalityName={municipalityName} />
      {onReview && (
        <div className="slompsim-card__actions">
          <Button variant="secondary" disabled={busy} onClick={onReview}>
            Revisar de nuevo
          </Button>
        </div>
      )}
    </section>
  );
}
