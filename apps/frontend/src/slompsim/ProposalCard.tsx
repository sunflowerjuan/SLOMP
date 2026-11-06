import { useEffect, useRef, useState } from "react";
import { ASSISTANT_BATCH_LIMIT_MESSAGE } from "../api/errorMessages";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { Notice } from "../components/ui/Notice";
import { SettlementStatusBadge } from "../components/ui/SettlementStatusBadge";
import { SETTLEMENT_STATUS_LABEL } from "../domain/settlementStatus";
import {
  PROPOSAL_ROWS_SHOWN,
  proposalLevel,
  targetStatuses,
} from "../domain/slompsim";
import type { Proposal } from "../domain/slompsim";
import type { ProposalEntry } from "../domain/slompsimConversation";
import { formatCount } from "../utils/formatCount";
import { AppliedCard, ConflictCard, RejectedCard } from "./ProposalOutcomes";
import { SlompsimRows } from "./SlompsimRows";
import { useSlompsim } from "./useSlompsim";
import "./SlompsimCards.css";

interface ProposalCardProps {
  entry: ProposalEntry;
  busy: boolean;
  municipalityName: string;
  onSeeSettlements: () => void;
}

function batchTitle(proposal: Proposal): string {
  const targets = targetStatuses(proposal.changes);
  const periods = formatCount(proposal.changes.length, "periodo", "periodos");
  return targets.length === 1
    ? `Pasar ${periods} a ${SETTLEMENT_STATUS_LABEL[targets[0]]}`
    : `Cambiar el estado de ${periods}`;
}

// How a proposal the Administrator didn't apply ended.
const CLOSED_HINT: Partial<Record<ProposalEntry["stage"]["name"], string>> = {
  discarded: "Descartada. Nada cambió.",
  replaced: "Reemplazada por la siguiente propuesta.",
};

function SingleChange({ proposal }: { proposal: Proposal }) {
  const [change] = proposal.changes;
  return (
    <>
      <div className="slompsim-transition">
        <SettlementStatusBadge status={change.from} />
        <Icon>
          <path d="M3 8h10M9 4l4 4-4 4" />
        </Icon>
        <span className="slompsim-card__reader-only"> a </span>
        <SettlementStatusBadge status={change.to} />
      </div>
      <dl className="slompsim-facts">
        <dt>Predio</dt>
        <dd>{change.cadastralCode}</dd>
        {change.resolutionNumber && (
          <>
            <dt>Resolución</dt>
            <dd>{change.resolutionNumber}</dd>
          </>
        )}
        {proposal.note && (
          <>
            <dt>Nota</dt>
            <dd>{proposal.note}</dd>
          </>
        )}
      </dl>
    </>
  );
}

function BatchChanges({ proposal }: { proposal: Proposal }) {
  const { changes, note } = proposal;
  const targets = targetStatuses(changes);
  const hidden = changes.length - PROPOSAL_ROWS_SHOWN;
  return (
    <>
      <SlompsimRows
        // Several targets: the row must say where each one goes.
        header={[
          "Predio",
          "Periodo",
          targets.length === 1 ? "Estado actual" : "Estado nuevo",
        ]}
        rows={changes
          .slice(0, PROPOSAL_ROWS_SHOWN)
          .map(({ settlementId, cadastralCode, period, from, to }) => ({
            key: settlementId,
            first: cadastralCode,
            second: String(period),
            status: targets.length === 1 ? from : to,
          }))}
      />
      {hidden > 0 && <p className="slompsim-card__hint">y {hidden} más</p>}
      {targets.length > 1 && (
        <p className="slompsim-card__text">
          {targets
            .map(
              (status) =>
                `${changes.filter(({ to }) => to === status).length} a ${SETTLEMENT_STATUS_LABEL[status]}`,
            )
            .join(", ")}
          .
        </p>
      )}
      {note && (
        <dl className="slompsim-facts">
          <dt>Nota</dt>
          <dd>{note}</dd>
        </dl>
      )}
    </>
  );
}

function ChangeCard({
  entry,
  busy,
}: Pick<ProposalCardProps, "entry" | "busy">) {
  const { conversation } = useSlompsim();
  const { proposal, stage } = entry;
  const [understood, setUnderstood] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const level = proposalLevel(proposal);
  const count = proposal.changes.length;
  const changesText = formatCount(count, "cambio", "cambios");
  const applying = stage.name === "applying";
  const closedHint = CLOSED_HINT[stage.name];
  const [change] = proposal.changes;
  const applyLabel = level === 3 ? `Aplicar ${changesText}` : "Aplicar";

  // The buttons just went away: keep the keyboard where they were.
  useEffect(() => {
    if (stage.name === "discarded") {
      cardRef.current?.focus({ preventScroll: true });
    }
  }, [stage.name]);

  return (
    <section
      ref={cardRef}
      className="slompsim-card slompsim-card--proposal"
      data-closed={Boolean(closedHint)}
      tabIndex={-1}
      aria-label={`Propuesta de ${changesText}`}
    >
      <p className="slompsim-card__eyebrow">
        Cambio de estado · {formatCount(count, "liquidación", "liquidaciones")}
      </p>
      <h3 className="slompsim-card__title">
        {level === 2
          ? `Pasar la liquidación ${change.period} de ${SETTLEMENT_STATUS_LABEL[change.from]} a ${SETTLEMENT_STATUS_LABEL[change.to]}`
          : batchTitle(proposal)}
      </h3>
      {level === 2 ? (
        <SingleChange proposal={proposal} />
      ) : (
        <BatchChanges proposal={proposal} />
      )}
      {closedHint ? (
        <p className="slompsim-card__hint">{closedHint}</p>
      ) : (
        <>
          {proposal.leftOut > 0 && (
            <Notice variant="info">{ASSISTANT_BATCH_LIMIT_MESSAGE}</Notice>
          )}
          {level === 3 && (
            <label className="slompsim-check">
              <input
                type="checkbox"
                checked={understood}
                disabled={applying}
                onChange={(event) => setUnderstood(event.target.checked)}
              />
              Entiendo que se cambiarán{" "}
              {formatCount(count, "liquidación", "liquidaciones")}
            </label>
          )}
          {stage.name === "open" && stage.error && (
            <Notice>{stage.error}</Notice>
          )}
          <div className="slompsim-card__actions">
            <Button
              className="slompsim-card__apply"
              loading={applying}
              disabled={busy || (level === 3 && !understood)}
              onClick={() => conversation.apply(entry)}
            >
              {applying ? `Aplicando ${changesText}` : applyLabel}
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => conversation.discard(entry)}
            >
              Descartar
            </Button>
          </div>
          <p className="slompsim-card__hint">
            Nada cambia hasta que pulses Aplicar.
          </p>
        </>
      )}
    </section>
  );
}

// A proposal in the conversation, by its level of impact (section 4 of the
// design) and by how far it went.
export function ProposalCard({
  entry,
  busy,
  municipalityName,
  onSeeSettlements,
}: ProposalCardProps) {
  const { conversation } = useSlompsim();
  const { proposal, stage } = entry;
  const hasChanges = proposalLevel(proposal) > 1;
  const canPick = stage.name === "open" && !hasChanges;
  const isLast = conversation.entries.at(-1)?.id === entry.id;

  if (stage.name === "applied") {
    return (
      <AppliedCard
        applied={stage.applied}
        at={stage.at}
        onSeeSettlements={onSeeSettlements}
      />
    );
  }
  if (stage.name === "conflict") {
    return (
      <ConflictCard
        message={stage.message}
        rejected={stage.rejected}
        municipalityName={municipalityName}
        busy={busy}
        // Once reviewed, the new proposal is what counts.
        onReview={isLast ? () => conversation.reviewAgain(entry) : undefined}
      />
    );
  }
  return (
    <>
      {hasChanges && <ChangeCard entry={entry} busy={busy} />}
      {proposal.rejected.length > 0 && (
        <RejectedCard
          rejected={proposal.rejected}
          municipalityName={municipalityName}
          busy={busy}
          onPick={
            canPick
              ? (status) =>
                  conversation.propose(
                    proposal.rejected.map(({ settlementId }) => settlementId),
                    status,
                  )
              : undefined
          }
        />
      )}
      {!hasChanges && proposal.rejected.length === 0 && (
        <p className="slompsim-message">
          Ya {proposal.unchanged.length === 1 ? "está" : "están"} en{" "}
          {SETTLEMENT_STATUS_LABEL[proposal.unchanged[0].to]}.
        </p>
      )}
    </>
  );
}
