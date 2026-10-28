import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { MARKING_PROBLEM_MESSAGES } from "../../api/errorMessages";
import type { MarkerCatalogEntry } from "../../api/templates";
import { CloseIcon } from "../../components/ui/CloseIcon";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import type { MarkingProblem } from "../../domain/templateMarking";

export interface MenuGroup {
  id: string;
  title: string;
  // Shown under the title, e.g. how the table row repeats.
  explanation?: string;
  // Why none of the group's markers fit the selected text.
  problem?: MarkingProblem | null;
  entries: MarkerCatalogEntry[];
}

interface MarkerMenuProps {
  // The selected text, quoted at the top.
  text: string;
  groups: MenuGroup[];
  used: ReadonlySet<string>;
  // Fixed-position anchor of the floating menu: the highlighted selection.
  anchor: () => DOMRect | null;
  onPick: (entry: MarkerCatalogEntry) => void;
  onClose: () => void;
}

const GAP = 8;
const EDGE = 16;
// Same as max-height in GuidedMarking.css.
const MAX_HEIGHT = 520;

function quote(text: string): string {
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

// Floating beside the selection on a desktop; a bottom sheet on a phone,
// where there is no room beside anything. Arrows, Home and End move between
// markers, Enter picks one, Escape or Tab close it.
export function MarkerMenu({
  text,
  groups,
  used,
  anchor,
  onPick,
  onClose,
}: MarkerMenuProps) {
  const phone = useMediaQuery("(max-width: 900px)");
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Transparent, not hidden, until placed: a hidden menu can't take focus.
  const [position, setPosition] = useState<CSSProperties>({
    left: 0,
    top: 0,
    opacity: 0,
  });

  // Under the selection, or above it when there is more room there; it
  // never covers the selected text; a short side makes it scroll instead.
  useLayoutEffect(() => {
    if (phone) return;
    function place() {
      const box = ref.current;
      const rect = anchor();
      if (!box || !rect) return;
      const natural = Math.min(
        box.scrollHeight,
        MAX_HEIGHT,
        window.innerHeight * 0.6,
      );
      const left = Math.min(
        Math.max(EDGE, rect.left),
        window.innerWidth - box.offsetWidth - EDGE,
      );
      const below = window.innerHeight - rect.bottom - GAP - EDGE;
      const above = rect.top - GAP - EDGE;
      if (below >= natural || below >= above) {
        setPosition({ left, top: rect.bottom + GAP, maxHeight: below });
      } else {
        const height = Math.min(natural, above);
        setPosition({ left, top: rect.top - GAP - height, maxHeight: height });
      }
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, phone]);

  function items(): HTMLElement[] {
    return Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
  }

  useEffect(() => {
    const all = items();
    (
      all.find((item) => item.getAttribute("aria-disabled") !== "true") ??
      all[0]
    )?.focus({ preventScroll: true });
  }, []);

  // A click anywhere else closes it.
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onClose]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const all = items();
    const index = all.indexOf(document.activeElement as HTMLElement);
    const targets: Record<string, number> = {
      ArrowDown: (index + 1) % all.length,
      ArrowUp: (index - 1 + all.length) % all.length,
      Home: 0,
      End: all.length - 1,
    };
    if (event.key in targets) {
      event.preventDefault();
      all[targets[event.key]]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <>
      {phone && <div className="marker-menu__scrim" aria-hidden="true" />}
      <div
        ref={ref}
        className="marker-menu"
        data-variant={phone ? "sheet" : "floating"}
        style={phone ? undefined : position}
        onKeyDown={handleKeyDown}
      >
        <div className="marker-menu__header">
          <div>
            <p className="marker-menu__title" id={titleId}>
              ¿Qué dato va aquí?
            </p>
            <p className="marker-menu__quote">«{quote(text)}»</p>
          </div>
          <button
            type="button"
            className="marker-menu__close"
            aria-label="Cerrar sin asignar"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div
          className="marker-menu__list"
          role="menu"
          aria-labelledby={titleId}
        >
          {groups.map((group) => {
            const reasonId = `${titleId}-${group.id}`;
            return (
              <div
                key={group.id}
                role="group"
                aria-labelledby={`${reasonId}-title`}
                className="marker-menu__group"
              >
                <div className="marker-menu__group-head" role="presentation">
                  <p
                    id={`${reasonId}-title`}
                    className="marker-menu__group-title"
                  >
                    {group.title}
                  </p>
                  {group.explanation && (
                    <p
                      id={`${reasonId}-text`}
                      className="marker-menu__group-text"
                    >
                      {group.explanation}
                    </p>
                  )}
                  {group.problem && (
                    <p id={reasonId} className="marker-menu__group-problem">
                      {MARKING_PROBLEM_MESSAGES[group.problem]}
                    </p>
                  )}
                </div>
                {group.entries.map((entry) => {
                  const disabled = Boolean(group.problem);
                  const assigned = used.has(entry.key);
                  const describedBy = [
                    group.explanation && `${reasonId}-text`,
                    disabled && reasonId,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <div
                      key={entry.key}
                      role="menuitem"
                      tabIndex={-1}
                      className="marker-menu__item"
                      aria-disabled={disabled || undefined}
                      aria-describedby={describedBy || undefined}
                      onClick={() => {
                        if (!disabled) onPick(entry);
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        if (!disabled) onPick(entry);
                      }}
                    >
                      <span className="marker-menu__item-head">
                        <span className="marker-menu__label">
                          {entry.label}
                        </span>
                        {entry.required && (
                          <span className="marker-menu__badge">
                            Obligatorio
                          </span>
                        )}
                        {assigned && (
                          <span className="marker-menu__assigned">
                            Ya asignado
                          </span>
                        )}
                      </span>
                      <span className="marker-menu__description">
                        {entry.description}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
