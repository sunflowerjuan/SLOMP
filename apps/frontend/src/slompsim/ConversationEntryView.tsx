import { Button } from "../components/ui/Button";
import { Notice } from "../components/ui/Notice";
import type { ConversationEntry } from "../domain/slompsimConversation";
import { ProposalCard } from "./ProposalCard";
import { SlompsimRows } from "./SlompsimRows";
import { UnlistedQuestion } from "./UnlistedQuestion";
import { useSlompsim } from "./useSlompsim";
import "./ConversationEntryView.css";

interface ConversationEntryViewProps {
  entry: ConversationEntry;
  // A reply or an apply is on its way: nothing else can start.
  busy: boolean;
  municipalityName: string;
  onSeeSettlements: () => void;
}

export function ConversationEntryView({
  entry,
  busy,
  municipalityName,
  onSeeSettlements,
}: ConversationEntryViewProps) {
  const { conversation } = useSlompsim();

  switch (entry.kind) {
    case "user":
      return (
        <p className="slompsim-message slompsim-message--user">{entry.text}</p>
      );
    case "assistant":
      return (
        <div className="slompsim-message">
          {entry.text && <p>{entry.text}</p>}
          {entry.settlements.length > 0 && (
            <SlompsimRows
              header={["Resolución", "Periodo", "Estado"]}
              rows={entry.settlements.map((settlement) => ({
                key: settlement.id,
                first: settlement.resolutionNumber ?? "Sin resolución",
                second: String(settlement.period),
                status: settlement.status,
              }))}
            />
          )}
        </div>
      );
    case "unlisted":
      return <UnlistedQuestion entry={entry} busy={busy} />;
    case "proposal":
      return (
        <ProposalCard
          entry={entry}
          busy={busy}
          municipalityName={municipalityName}
          onSeeSettlements={onSeeSettlements}
        />
      );
    case "failure":
      return (
        <Notice>
          <div className="slompsim-failure">
            <span>{entry.message}</span>
            {entry.canRetry && (
              <Button variant="secondary" onClick={conversation.retry}>
                Reintentar
              </Button>
            )}
          </div>
        </Notice>
      );
  }
}
