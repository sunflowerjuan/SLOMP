import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { DocumentBlock, MarkerSelection } from "../../api/templates";
import { Button } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/CloseIcon";
import { Icon } from "../../components/ui/Icon";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  blockPieces,
  rowKey,
  sectionsOf,
  tableGrid,
  tableKeyOf,
} from "../../domain/templateMarking";
import type {
  DocumentItem,
  MarkSource,
  MarkingProblem,
  TableRow,
  TextRange,
} from "../../domain/templateMarking";
import { focusWithin } from "../../utils/scrollWithin";
import { DocumentSegments } from "./DocumentSegments";
import { clearSelection, readSelection } from "./documentSelection";
import { PART_LABEL } from "./documentText";

export interface DocumentMark {
  mark: MarkerSelection;
  source: MarkSource;
}

interface MarkingDocumentProps {
  blocks: DocumentBlock[];
  marks: DocumentMark[];
  // Spanish name of each marker, by key.
  labels: ReadonlyMap<string, string>;
  // The example row the table fields use, highlighted as the one that repeats.
  repeatingRow: string | null;
  // Rows left out of the template, and the rows of example values its table
  // still has (see surplusRows).
  removedRows: ReadonlySet<string>;
  surplus: TableRow[];
  onSelect: (range: TextRange, origin: HTMLElement) => void;
  onProblem: (problem: MarkingProblem) => void;
  onRemove: (mark: MarkerSelection) => void;
  onToggleRow: (row: TableRow) => void;
  onRemoveRows: (rows: TableRow[]) => void;
}

// A touch selection is adjusted with the handles for a while: it is read once
// it stops changing.
const TOUCH_SETTLE_MS = 450;

function preview(text: string): string {
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

export function MarkingDocument({
  blocks,
  marks,
  labels,
  repeatingRow,
  removedRows,
  surplus,
  onSelect,
  onProblem,
  onRemove,
  onToggleRow,
  onRemoveRows,
}: MarkingDocumentProps) {
  const toolsFirst = useMediaQuery("(max-width: 900px)");
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerDown = useRef(false);
  const lastPointer = useRef("mouse");
  const touchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hintId = useId();
  const [touchRange, setTouchRange] = useState<TextRange | null>(null);
  // Keyboard: the block whose text is being chosen in the text box.
  const [picking, setPicking] = useState<string | null>(null);
  // Roving focus: the one block button that is in the tab order.
  const [activeBlock, setActiveBlock] = useState(blocks[0]?.blockId ?? "");

  const latest = useRef({ onSelect, onProblem });
  useEffect(() => {
    latest.current = { onSelect, onProblem };
  });

  function blockElement(blockId: string): HTMLElement | null {
    return (
      rootRef.current?.querySelector<HTMLElement>(
        `[data-block-id="${CSS.escape(blockId)}"]`,
      ) ?? null
    );
  }

  // Mouse: the menu opens as soon as the button is released. Touch: the
  // selection is only read once it settles, and a bar offers the menu.
  useEffect(() => {
    function evaluateMouse() {
      const root = rootRef.current;
      if (!root) return;
      const result = readSelection(root);
      if (result.kind === "problem") {
        clearSelection();
        latest.current.onProblem(result.problem);
      } else if (result.kind === "range") {
        const origin = blockElement(result.range.blockId);
        if (origin) latest.current.onSelect(result.range, origin);
      }
    }

    function handlePointerUp() {
      if (!pointerDown.current) return;
      pointerDown.current = false;
      if (lastPointer.current === "mouse") setTimeout(evaluateMouse);
    }

    function handleSelectionChange() {
      if (lastPointer.current === "mouse") return;
      clearTimeout(touchTimer.current);
      touchTimer.current = setTimeout(() => {
        const root = rootRef.current;
        if (!root) return;
        const result = readSelection(root);
        setTouchRange(result.kind === "range" ? result.range : null);
        if (result.kind === "problem") {
          latest.current.onProblem(result.problem);
        }
      }, TOUCH_SETTLE_MS);
    }

    window.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
      clearTimeout(touchTimer.current);
    };
  }, []);

  function handleBlockKey(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setPicking(blocks[index].blockId);
      return;
    }
    const keys: Record<string, number> = {
      ArrowDown: index + 1,
      ArrowUp: index - 1,
      Home: 0,
      End: blocks.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const target = blocks[Math.max(0, Math.min(next, blocks.length - 1))];
    setActiveBlock(target.blockId);
    focusWithin(
      blockElement(target.blockId)?.querySelector<HTMLButtonElement>(
        ".marking-doc__focus",
      ),
    );
  }

  function renderBlock(block: DocumentBlock): ReactNode {
    const index = blocks.indexOf(block);
    const pieces = blockPieces(block, marks);
    return (
      <div
        key={block.blockId}
        className="marking-doc__block"
        data-block-id={block.blockId}
        data-length={block.text.length}
      >
        <button
          type="button"
          className="marking-doc__focus"
          tabIndex={block.blockId === activeBlock ? 0 : -1}
          aria-label={`Marcar texto del párrafo «${preview(block.text)}»`}
          aria-describedby={hintId}
          onFocus={() => setActiveBlock(block.blockId)}
          onKeyDown={(event) => handleBlockKey(event, index)}
          onClick={() => setPicking(block.blockId)}
        />
        {pieces.map((piece) => {
          if (piece.kind === "text") {
            return (
              <DocumentSegments
                key={`t${piece.segments[0]?.start ?? 0}`}
                segments={piece.segments}
              />
            );
          }
          const { mark, source } = piece;
          const label = labels.get(mark.field) ?? "Marcador";
          if (source === "pending") {
            return (
              <mark
                key={`p${mark.start}`}
                className="marking-doc__mark"
                data-source="pending"
              >
                <DocumentSegments segments={piece.segments} />
              </mark>
            );
          }
          // The file's own markers are tags such as {totalAmount}: only
          // their Spanish name is shown, never the tag itself.
          return (
            <mark
              key={`m${mark.start}`}
              className="marking-doc__mark"
              data-source={source}
              data-field={mark.field}
            >
              <span className="marking-doc__sr">
                {source === "file"
                  ? `Marcador que ya traía el archivo: ${label}.`
                  : `Marcador ${label}, en lugar de: `}
              </span>
              {source === "lawyer" && (
                <DocumentSegments segments={piece.segments} />
              )}
              {/* The name and its x as one chip: they never wrap apart. */}
              <span className="marking-doc__chip">
                <span className="marking-doc__tag" aria-hidden="true">
                  {label}
                </span>
                {source === "lawyer" && (
                  <button
                    type="button"
                    className="marking-doc__remove"
                    aria-label={`Quitar el marcador ${label} de «${preview(piece.text)}»`}
                    title="Quitar marcador"
                    onClick={() => onRemove(mark)}
                  >
                    <CloseIcon />
                  </button>
                )}
              </span>
            </mark>
          );
        })}
        {picking === block.blockId && (
          <TextPicker
            block={block}
            onChoose={(start, end, origin) =>
              onSelect({ blockId: block.blockId, start, end }, origin)
            }
            onEmpty={() => onProblem("EMPTY")}
            onClose={(refocus) => {
              setPicking(null);
              if (refocus) {
                focusWithin(
                  blockElement(block.blockId)?.querySelector<HTMLButtonElement>(
                    ".marking-doc__focus",
                  ),
                );
              }
            }}
          />
        )}
      </div>
    );
  }

  // The rows that have a marker: they can't be removed.
  const markedRows = new Set(
    marks.map(({ mark }) => {
      const block = blocks.find(
        (candidate) => candidate.blockId === mark.blockId,
      );
      return block ? rowKey(block) : null;
    }),
  );

  function renderTable(
    item: Extract<DocumentItem, { kind: "table" }>,
  ): ReactNode {
    const { rows, columns } = tableGrid(item.blocks);
    const holdsExample =
      repeatingRow !== null && tableKeyOf(repeatingRow) === item.key;
    const removedHere = [...removedRows].filter(
      (row) => tableKeyOf(row) === item.key,
    );
    // Rows can be removed in the table that repeats, or restored where some
    // already were. On a phone the table scrolls sideways, so the row
    // actions go first, where they are always in sight.
    const tools = holdsExample || removedHere.length > 0;
    const extra = holdsExample ? surplus : [];

    return (
      <div key={item.key} className="marking-doc__table-wrap">
        <table className="marking-doc__table">
          <tbody>
            {rows.map(({ rowIndex, cells }) => {
              const rowBlocks = [...cells.values()].flat();
              const key = rowKey(rowBlocks[0])!;
              const repeats = key === repeatingRow;
              const removed = removedRows.has(key);
              const text = rowBlocks
                .map((block) => block.text)
                .filter(Boolean)
                .join(" · ");
              const toolsCell = tools && (
                <td className="marking-doc__row-tools">
                  {repeats ? (
                    <span
                      className="marking-doc__row-tag"
                      title="Fila de ejemplo: se repite en cada liquidación"
                    >
                      <Icon>
                        <path d="M2.5 6.5a5 5 0 0 1 9-2.5M13.5 9.5a5 5 0 0 1-9 2.5" />
                        <path d="M11.5 1.5v2.5H9M4.5 14.5V12H7" />
                      </Icon>
                      <span className="marking-doc__sr">Fila de ejemplo</span>
                    </span>
                  ) : (
                    !markedRows.has(key) && (
                      <button
                        type="button"
                        className="marking-doc__row-button"
                        data-removed={removed || undefined}
                        aria-label={`${removed ? "Restaurar" : "Quitar"} la fila «${preview(text)}»`}
                        title={
                          removed
                            ? "Restaurar la fila"
                            : "Quitar la fila de la plantilla"
                        }
                        onClick={() =>
                          onToggleRow({
                            row: key,
                            blockId: rowBlocks[0].blockId,
                          })
                        }
                      >
                        <Icon>
                          {removed ? (
                            <path d="M3 6.5h7a3.5 3.5 0 0 1 0 7H6M5.5 3.5 2.5 6.5l3 3" />
                          ) : (
                            <path d="M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.7 9h6.6l.7-9M6.8 7v4.5M9.2 7v4.5" />
                          )}
                        </Icon>
                      </button>
                    )
                  )}
                </td>
              );
              return (
                <tr
                  key={rowIndex}
                  data-repeats={repeats || undefined}
                  data-removed={removed || undefined}
                >
                  {toolsFirst && toolsCell}
                  {Array.from({ length: columns }, (_, colIndex) => (
                    <td key={colIndex}>
                      {(cells.get(colIndex) ?? []).map(renderBlock)}
                    </td>
                  ))}
                  {tools && !toolsFirst && toolsCell}
                </tr>
              );
            })}
          </tbody>
        </table>
        {holdsExample && (
          <p className="marking-doc__repeat-note">
            Deja solo esta fila con los datos de la tabla: al generar cada
            liquidación se repite y se llena con cada vigencia y concepto que
            cobre.
          </p>
        )}
        {extra.length > 0 && (
          <div className="marking-doc__surplus" role="note">
            <p>
              {extra.length === 1
                ? "Esta tabla tiene 1 fila más con valores de ejemplo."
                : `Esta tabla tiene ${extra.length} filas más con valores de ejemplo.`}{" "}
              Si se quedan, saldrán iguales en todas las liquidaciones.
            </p>
            <Button variant="secondary" onClick={() => onRemoveRows(extra)}>
              {extra.length === 1
                ? "Quitar esa fila"
                : `Quitar las ${extra.length} filas`}
            </Button>
          </div>
        )}
        {removedHere.length > 0 && (
          <p className="marking-doc__removed-note">
            {removedHere.length === 1
              ? "Se quitó 1 fila con valores de ejemplo: saldría igual en todas las liquidaciones."
              : `Se quitaron ${removedHere.length} filas con valores de ejemplo: saldrían iguales en todas las liquidaciones.`}{" "}
            Si alguna debe quedar, restáurala con su botón.
          </p>
        )}
      </div>
    );
  }

  const sections = sectionsOf(blocks);
  const labelled = sections.some((section) => section.part !== "body");

  return (
    <div
      ref={rootRef}
      className="marking-doc"
      onPointerDown={(event) => {
        // Selecting inside the keyboard text box is that box's business.
        pointerDown.current = !(event.target as Element).closest(
          ".marking-doc__picker",
        );
        lastPointer.current = event.pointerType;
      }}
    >
      <p id={hintId} className="marking-doc__sr">
        Enter abre el texto del párrafo para elegir qué parte marcar. Flecha
        arriba y abajo cambian de párrafo.
      </p>
      {sections.map((section, index) => (
        <section
          // Parts repeat (several headers); their order never changes.
          key={`${section.part}${index}`}
          className="marking-doc__part"
          data-part={section.part}
          aria-label={PART_LABEL[section.part]}
        >
          {labelled && (
            <p className="marking-doc__part-label" aria-hidden="true">
              {PART_LABEL[section.part]}
            </p>
          )}
          {section.items.map((item) =>
            item.kind === "table" ? renderTable(item) : renderBlock(item.block),
          )}
        </section>
      ))}

      {touchRange && (
        <div className="marking-doc__touch-bar">
          <Button
            fullWidth
            size="lg"
            onClick={() => {
              const origin = blockElement(touchRange.blockId);
              clearTimeout(touchTimer.current);
              setTouchRange(null);
              if (origin) onSelect(touchRange, origin);
            }}
          >
            Asignar marcador
          </Button>
        </div>
      )}
    </div>
  );
}

// Keys that jump to an end of the paragraph in the keyboard text box.
const JUMP_KEYS: Record<string, "start" | "end"> = {
  Home: "start",
  PageUp: "start",
  End: "end",
  PageDown: "end",
};

interface TextPickerProps {
  block: DocumentBlock;
  onChoose: (start: number, end: number, origin: HTMLElement) => void;
  onEmpty: () => void;
  onClose: (refocus: boolean) => void;
}

// Keyboard way to select text: a box with the paragraph, where Shift + arrows
// select and the box itself says exactly which characters. It can't be
// readOnly (Chromium then moves no caret with the keys), so every edit is
// refused instead.
function TextPicker({ block, onChoose, onEmpty, onClose }: TextPickerProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const labelId = useId();

  useEffect(() => {
    focusWithin(ref.current);
  }, []);

  function choose() {
    const box = ref.current;
    if (!box) return;
    if (box.selectionStart === box.selectionEnd) {
      onEmpty();
      box.focus({ preventScroll: true });
      return;
    }
    const origin =
      box
        .closest<HTMLElement>("[data-block-id]")
        ?.querySelector<HTMLElement>(".marking-doc__focus") ?? box;
    onChoose(box.selectionStart, box.selectionEnd, origin);
    onClose(false);
  }

  return (
    <div className="marking-doc__picker" role="group" aria-labelledby={labelId}>
      <p id={labelId} className="marking-doc__picker-label">
        Selecciona el texto con Mayús y las flechas, y presiona Enter.
      </p>
      <textarea
        ref={ref}
        className="marking-doc__picker-text"
        value={block.text}
        aria-readonly="true"
        inputMode="none"
        spellCheck={false}
        onChange={() => undefined}
        onBeforeInput={(event) => event.preventDefault()}
        onPaste={(event) => event.preventDefault()}
        onCut={(event) => event.preventDefault()}
        onDrop={(event) => event.preventDefault()}
        rows={Math.min(6, Math.ceil(block.text.length / 60) + 1)}
        aria-labelledby={labelId}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            choose();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onClose(true);
          } else if (event.key in JUMP_KEYS) {
            // Chromium also scrolls the document behind with these: the
            // caret moves here and nothing else does.
            event.preventDefault();
            const box = event.currentTarget;
            const to = JUMP_KEYS[event.key] === "start" ? 0 : box.value.length;
            if (event.shiftKey) {
              const anchor =
                box.selectionDirection === "backward"
                  ? box.selectionEnd
                  : box.selectionStart;
              box.setSelectionRange(
                Math.min(anchor, to),
                Math.max(anchor, to),
                to < anchor ? "backward" : "forward",
              );
            } else {
              box.setSelectionRange(to, to);
            }
          } else if (
            event.key === "Backspace" ||
            event.key === "Delete" ||
            (event.key.length === 1 && !event.ctrlKey && !event.metaKey)
          ) {
            // Refused here, not only on input: Chromium would still drop
            // the selection.
            event.preventDefault();
          }
        }}
      />
      <div className="marking-doc__picker-actions">
        <Button variant="secondary" onClick={() => onClose(true)}>
          Cancelar
        </Button>
        <Button onClick={choose}>Elegir marcador</Button>
      </div>
    </div>
  );
}
