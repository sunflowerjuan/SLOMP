import { useId, useRef, useState } from "react";
import { TEMPLATE_NAME_MESSAGES } from "../../api/errorMessages";
import { Icon } from "../../components/ui/Icon";
import {
  MAX_TEMPLATE_NAME_LENGTH,
  templateNameOf,
  templateNameProblem,
} from "../../domain/templateMarking";
import type { TemplateNameProblem } from "../../domain/templateMarking";

interface EditableTemplateNameProps {
  // Without .docx, which the backend adds.
  value: string;
  // "liquidación" or "mandamiento".
  documentName: string;
  onChange: (name: string) => void;
}

// The screen's title is the name the template is saved under, with a pencil
// to change it right there. Enter or leaving the box keeps a valid name;
// Escape (or leaving it with an invalid one) puts the previous name back.
export function EditableTemplateName({
  value,
  documentName,
  onChange,
}: EditableTemplateNameProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState<TemplateNameProblem | null>(null);
  const pencilRef = useRef<HTMLButtonElement>(null);
  const errorId = useId();

  function start() {
    setDraft(value);
    setProblem(null);
    setEditing(true);
  }

  function finish(save: boolean) {
    if (save) {
      const found = templateNameProblem(draft);
      if (found) {
        setProblem(found);
        return false;
      }
      onChange(templateNameOf(draft.trim()).trim().replace(/ +/g, " "));
    }
    setEditing(false);
    setProblem(null);
    // Back on the pencil once the box is gone.
    setTimeout(() => pencilRef.current?.focus({ preventScroll: true }));
    return true;
  }

  if (editing) {
    return (
      <span className="template-name template-name--editing">
        <span className="template-name__field">
          <input
            className="template-name__input"
            aria-label={`Nombre de la plantilla de ${documentName}`}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? errorId : undefined}
            value={draft}
            maxLength={MAX_TEMPLATE_NAME_LENGTH + 5}
            autoComplete="off"
            spellCheck={false}
            // Opened on purpose, by the pencil: the box takes the focus.
            ref={(input) => input?.focus({ preventScroll: true })}
            onChange={(event) => {
              setDraft(event.target.value);
              setProblem(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                finish(true);
              } else if (event.key === "Escape") {
                event.preventDefault();
                finish(false);
              }
            }}
            onBlur={() => {
              if (!finish(true)) finish(false);
            }}
          />
          <span className="template-name__extension" aria-hidden="true">
            .docx
          </span>
        </span>
        {problem && (
          <span id={errorId} className="template-name__error" role="alert">
            {TEMPLATE_NAME_MESSAGES[problem]}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="template-name">
      <span className="template-name__text">{value}</span>
      <button
        ref={pencilRef}
        type="button"
        className="template-name__edit"
        aria-label={`Cambiar el nombre de la plantilla «${value}»`}
        title="Cambiar el nombre con el que se guarda"
        onClick={start}
      >
        <Icon>
          <path d="M11.5 2.5 13.5 4.5 5 13H3v-2z" />
          <path d="M10 4l2 2" />
        </Icon>
      </button>
    </span>
  );
}
