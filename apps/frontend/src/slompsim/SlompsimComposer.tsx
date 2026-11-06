import { useId, useLayoutEffect } from "react";
import type { FormEvent, KeyboardEvent, RefObject } from "react";
import { Icon } from "../components/ui/Icon";
import { MAX_MESSAGE_LENGTH } from "../domain/slompsim";
import { useMediaQuery } from "../hooks/useMediaQuery";
import "./SlompsimComposer.css";

const KEYS_HINT = "Enter envía · Mayús + Enter, nueva línea";

interface SlompsimComposerProps {
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  waiting: boolean;
  applying: boolean;
}

export function SlompsimComposer({
  fieldRef,
  value,
  onChange,
  onSubmit,
  waiting,
  applying,
}: SlompsimComposerProps) {
  const hintId = useId();
  // Touch keyboards have no Shift+Enter: there Enter is a new line and the
  // button sends.
  const isTouch = useMediaQuery("(pointer: coarse)");

  // Grows with the text; the CSS stops it at six lines.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [fieldRef, value]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !isTouch &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <form className="slompsim-composer" onSubmit={handleSubmit}>
      <div className="slompsim-composer__field" data-disabled={applying}>
        <textarea
          ref={fieldRef}
          className="slompsim-composer__input"
          rows={1}
          value={value}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={applying}
          placeholder={
            applying
              ? "Espera a que se apliquen los cambios…"
              : "Escribe qué necesitas…"
          }
          aria-label="Mensaje para Slompsim"
          aria-describedby={isTouch ? undefined : hintId}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="submit"
          className="slompsim-composer__send"
          aria-label="Enviar"
          disabled={!value.trim() || waiting || applying}
        >
          <Icon box={24}>
            <path d="M12 19V5M6 11l6-6 6 6" />
          </Icon>
        </button>
      </div>
      <p className="slompsim-composer__foot">
        <span>No escribas nombres ni documentos de personas.</span>
        {!isTouch && (
          <span
            id={hintId}
            className="slompsim-composer__hint"
            data-visible={Boolean(value)}
          >
            {KEYS_HINT}
          </span>
        )}
      </p>
    </form>
  );
}
