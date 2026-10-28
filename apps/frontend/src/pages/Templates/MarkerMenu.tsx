import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { MARKING_PROBLEM_MESSAGES } from "../../api/errorMessages";
import type { MarkerCatalogEntry } from "../../api/templates";
import { CloseIcon } from "../../components/ui/CloseIcon";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { focusWithin } from "../../utils/scrollWithin";
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
  // Fixed-position anchor of the floating menu: the highlighted selection,
  // or null once it is out of sight (the menu then closes).
  anchor: () => DOMRect | null;
  onPick: (entry: MarkerCatalogEntry) => void;
  onClose: () => void;
}

const GAP = 8;
const EDGE = 16;

// For the search: "Código" and "codigo" match.
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matches(entry: MarkerCatalogEntry, query: string): boolean {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const text = normalize(`${entry.label} ${entry.description}`);
  return words.every((word) => text.includes(word));
}
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
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => matches(entry, query)),
    }))
    .filter((group) => group.entries.length > 0);
  const found = visibleGroups.reduce(
    (count, group) => count + group.entries.length,
    0,
  );
  // Transparent, not hidden, until placed: a hidden menu can't take focus.
  const [position, setPosition] = useState<CSSProperties>({
    left: 0,
    top: 0,
    opacity: 0,
  });

  // Which side of the selection it opened on, and its height: chosen once,
  // when it opens, so it never jumps from one side to the other or grows and
  // shrinks while it is being used.
  const layout = useRef<{ side: "below" | "above"; height: number } | null>(
    null,
  );
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  });

  // Under the selection, or above it when there is more room there; it never
  // covers the selected text, and a short side makes the list scroll inside.
  // Scrolling the document carries it along with the selection; once the
  // selection leaves the screen, it closes.
  useLayoutEffect(() => {
    if (phone) return;
    function place(event?: Event) {
      const box = ref.current;
      // Its own list scrolling is no reason to move.
      if (event && box?.contains(event.target as Node)) return;
      const rect = anchor();
      if (!box) return;
      if (!rect) {
        latestClose.current();
        return;
      }
      if (!layout.current) {
        const natural = Math.min(
          box.scrollHeight,
          MAX_HEIGHT,
          window.innerHeight * 0.6,
        );
        const below = window.innerHeight - rect.bottom - GAP - EDGE;
        const above = rect.top - GAP - EDGE;
        layout.current =
          below >= natural || below >= above
            ? { side: "below", height: Math.min(natural, below) }
            : { side: "above", height: Math.min(natural, above) };
      }
      const { side, height } = layout.current;
      const left = Math.min(
        Math.max(EDGE, rect.left),
        window.innerWidth - box.offsetWidth - EDGE,
      );
      const limit = window.innerHeight - height - EDGE;
      if (side === "below") {
        setPosition({
          left,
          top: Math.min(Math.max(EDGE, rect.bottom + GAP), limit),
          maxHeight: height,
        });
      } else {
        // Held by its bottom edge: when the search leaves fewer markers it
        // shrinks away from the top, still next to the selection.
        const top = Math.min(Math.max(EDGE, rect.top - GAP - height), limit);
        setPosition({
          left,
          bottom: window.innerHeight - top - height,
          maxHeight: height,
        });
      }
    }
    place();
    // A new window size starts the layout over.
    function resize() {
      layout.current = null;
      place();
    }
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor, phone]);

  function items(): HTMLElement[] {
    return Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
  }

  function firstEnabled(): HTMLElement | undefined {
    const all = items();
    return (
      all.find((item) => item.getAttribute("aria-disabled") !== "true") ??
      all[0]
    );
  }

  // A desktop starts in the search; a phone on the first marker, so its
  // keyboard doesn't cover the list before it is asked for.
  useEffect(() => {
    if (phone) firstEnabled()?.focus({ preventScroll: true });
    else searchRef.current?.focus({ preventScroll: true });
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const search = searchRef.current;
    if (event.target === search) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        focusWithin(all[0]);
      } else if (event.key === "Enter") {
        // The first marker that fits, as if it had been chosen.
        event.preventDefault();
        const first = firstEnabled();
        if (first && first.getAttribute("aria-disabled") !== "true") {
          first.click();
        }
      } else if (event.key === "Escape" && query) {
        event.preventDefault();
        setQuery("");
      } else if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        onClose();
      }
      return;
    }
    const index = all.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowUp" && index === 0 && search) {
      event.preventDefault();
      search.focus({ preventScroll: true });
      return;
    }
    // Typing on a marker goes on in the search.
    if (
      search &&
      (event.key.length === 1 || event.key === "Backspace") &&
      event.key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      search.focus({ preventScroll: true });
      return;
    }
    const targets: Record<string, number> = {
      ArrowDown: (index + 1) % all.length,
      ArrowUp: (index - 1 + all.length) % all.length,
      Home: 0,
      End: all.length - 1,
    };
    if (event.key in targets) {
      event.preventDefault();
      // Inside its own list only: the page behind never moves.
      focusWithin(all[targets[event.key]]);
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
        <div className="marker-menu__search">
          <input
            ref={searchRef}
            type="search"
            className="marker-menu__search-input"
            placeholder="Buscar marcador"
            aria-label="Buscar marcador"
            aria-controls={`${titleId}-list`}
            aria-describedby={`${titleId}-found`}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <p id={`${titleId}-found`} className="marking-doc__sr" role="status">
          {query && (found === 1 ? "1 marcador" : `${found} marcadores`)}
        </p>
        <div
          id={`${titleId}-list`}
          className="marker-menu__list"
          role="menu"
          aria-labelledby={titleId}
        >
          {found === 0 && (
            <p className="marker-menu__empty">
              Ningún marcador coincide con «{query}».
            </p>
          )}
          {visibleGroups.map((group) => {
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
