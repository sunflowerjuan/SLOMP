import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { CloseIcon } from "../components/ui/CloseIcon";
import { isApplying } from "../domain/slompsimConversation";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { adminHref } from "../routes";
import { ConversationEntryView } from "./ConversationEntryView";
import { SlompsimComposer } from "./SlompsimComposer";
import { SLOMPSIM_PANEL_ID } from "./SlompsimContext";
import { SlompsimIcon } from "./SlompsimIcon";
import { SlompsimWelcome } from "./SlompsimWelcome";
import { useSlompsim } from "./useSlompsim";
import "./SlompsimPanel.css";

interface SlompsimPanelProps {
  slug: string;
  municipalityName: string;
}

// The chat (design in Confluence "Diseño de Slompsim"). It floats without a
// scrim, so the screen behind stays usable; on a phone it takes the whole
// screen. Always mounted, so it slides, and so closing keeps what is typed.
export function SlompsimPanel({ slug, municipalityName }: SlompsimPanelProps) {
  const { isOpen, close, conversation } = useSlompsim();
  const { entries, waiting, send, reset } = conversation;
  const [draft, setDraft] = useState("");
  const titleId = useId();
  const logRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const isCompact = useMediaQuery("(max-width: 900px)");
  const applying = isApplying(entries);
  const busy = waiting || applying;
  const startsOnFile = entries.at(-1)?.kind === "unlisted";

  useEffect(() => {
    if (isOpen) fieldRef.current?.focus({ preventScroll: true });
  }, [isOpen]);

  // Like any chat, the log shows the newest content; a question about the
  // file is read from its beginning.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const last = log.lastElementChild;
    log.scrollTop =
      startsOnFile && last instanceof HTMLElement
        ? last.offsetTop
        : log.scrollHeight;
  }, [entries, waiting, startsOnFile]);

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Escape") close();
  }

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    send(text);
    setDraft("");
  }

  function startOver() {
    reset();
    setDraft("");
    fieldRef.current?.focus({ preventScroll: true });
  }

  function seeSettlements() {
    window.location.hash = adminHref(slug, "liquidaciones");
    // On a phone the panel covers the whole screen.
    if (isCompact) close({ returnFocus: false });
  }

  return (
    <dialog
      id={SLOMPSIM_PANEL_ID}
      className="slompsim-panel"
      open
      data-open={isOpen}
      aria-modal="false"
      aria-labelledby={titleId}
      inert={!isOpen}
      onKeyDown={handleKeyDown}
    >
      <header className="slompsim-panel__header">
        <span className="slompsim-panel__mark" aria-hidden="true">
          <SlompsimIcon />
        </span>
        <div className="slompsim-panel__heading">
          <h2 id={titleId} className="slompsim-panel__title">
            Slompsim
          </h2>
          <p className="slompsim-panel__municipality">{municipalityName}</p>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            className="slompsim-panel__new"
            disabled={applying}
            onClick={startOver}
          >
            Nueva conversación
          </button>
        )}
        <button
          type="button"
          className="slompsim-panel__close"
          aria-label="Cerrar Slompsim"
          onClick={() => close()}
        >
          <CloseIcon />
        </button>
      </header>
      <div
        ref={logRef}
        className="slompsim-panel__log"
        role="log"
        aria-live="polite"
        aria-label="Conversación con Slompsim"
      >
        {entries.length === 0 && !waiting && (
          <SlompsimWelcome
            onPick={(text) => {
              setDraft(text);
              fieldRef.current?.focus({ preventScroll: true });
            }}
          />
        )}
        {entries.map((entry) => (
          <ConversationEntryView
            key={entry.id}
            entry={entry}
            busy={busy}
            municipalityName={municipalityName}
            onSeeSettlements={seeSettlements}
          />
        ))}
        {waiting && (
          <div className="slompsim-thinking" aria-busy="true">
            <i />
            <i />
            <i />
            <p className="slompsim-thinking__label">
              Buscando las liquidaciones…
            </p>
          </div>
        )}
      </div>
      <SlompsimComposer
        fieldRef={fieldRef}
        value={draft}
        onChange={setDraft}
        onSubmit={submit}
        waiting={waiting}
        applying={applying}
      />
    </dialog>
  );
}
