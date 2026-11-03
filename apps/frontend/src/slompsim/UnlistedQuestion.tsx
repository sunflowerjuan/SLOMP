import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import { SETTLEMENT_STATUS_LABEL } from "../domain/settlementStatus";
import {
  groupPeriods,
  unlistedScope,
  unlistedTargets,
} from "../domain/slompsim";
import type { UnlistedEntry } from "../domain/slompsimConversation";
import { formatPeriods } from "../utils/formatPeriods";
import { SlompsimRows } from "./SlompsimRows";
import { useSlompsim } from "./useSlompsim";
import "./SlompsimCards.css";

interface UnlistedQuestionProps {
  entry: UnlistedEntry;
  busy: boolean;
}

// What the chat opens with from the payment orders Excel: written by the
// panel from the file's review, without waiting for the model. Its buttons
// build the proposal directly too.
export function UnlistedQuestion({ entry, busy }: UnlistedQuestionProps) {
  const { conversation } = useSlompsim();
  const { rows, fileName, asking, continued } = entry;
  const { periods, properties } = unlistedScope(rows);

  return (
    <div className="slompsim-unlisted">
      {!continued && (
        <p className="slompsim-context">
          <Icon>
            <path d="M4 1.5h5l3 3v10H4z" />
            <path d="M9 1.5v3h3" />
          </Icon>
          <span>
            Revisando <strong>{fileName}</strong>
          </span>
        </p>
      )}
      <div className="slompsim-message">
        <p>
          {continued ? (
            <>
              Quedan{" "}
              <strong>
                {periods} de {properties}
              </strong>{" "}
              por revisar.
            </>
          ) : (
            <>
              En el Excel faltan{" "}
              <strong>
                {periods} de {properties}
              </strong>{" "}
              que sí aparecen en este archivo. Que no aparezcan no quiere decir
              que estén pagados.
            </>
          )}
        </p>
        <SlompsimRows
          header={["Predio", "Periodos", "Estado"]}
          widePeriods
          rows={groupPeriods(rows).map((group) => ({
            key: `${group.cadastralCode}:${group.status}`,
            first: group.cadastralCode,
            second: formatPeriods(group.periods),
            status: group.status,
          }))}
        />
        {asking && (
          <p>
            Como no están en ningún mandamiento, pueden pasar ya a pérdida
            temporal de competencia. ¿A qué estado los paso?
          </p>
        )}
      </div>
      {asking && (
        <>
          <div
            className="slompsim-card__actions slompsim-card__actions--states"
            role="group"
            aria-label="Estado para los periodos que faltan"
          >
            {unlistedTargets(rows).map((status) => (
              <Button
                key={status}
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  conversation.propose(
                    rows.map(({ id }) => id),
                    status,
                  )
                }
              >
                {SETTLEMENT_STATUS_LABEL[status]}
              </Button>
            ))}
          </div>
          <p className="slompsim-card__hint">
            También puedes escribir un estado distinto para cada predio, o
            dejarlos como están.
          </p>
        </>
      )}
    </div>
  );
}
