import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { DocumentBlock, MarkerSelection } from "../../api/templates";
import { Button } from "../../components/ui/Button";
import { blockPieces, rowKey } from "../../domain/templateMarking";
import type {
  MarkSource,
  MarkingProblem,
  Segment,
  TextRange,
} from "../../domain/templateMarking";
import { clearSelection, readSelection } from "./documentSelection";

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
  onSelect: (range: TextRange, origin: HTMLElement) => void;
  onProblem: (problem: MarkingProblem) => void;
  onRemove: (mark: MarkerSelection) => void;
}

const PART_LABEL: Record<DocumentBlock["part"], string> = {
  header: "Encabezado",
  body: "Cuerpo del documento",
  footer: "Pie de página",
};

// A touch selection is adjusted with the handles for a while: it is read once
// it stops changing.
const TOUCH_SETTLE_MS = 450;

type Item =
  | { kind: "paragraph"; block: DocumentBlock }
  | { kind: "table"; key: string; blocks: DocumentBlock[] };

interface Section {
  part: DocumentBlock["part"];
  items: Item[];
}

// Consecutive blocks of a part, with the cells of one table gathered.
function sectionsOf(blocks: DocumentBlock[]): Section[] {
  const sections: Section[] = [];
  for (const block of blocks) {
    let section = sections.at(-1);
    if (section?.part !== block.part) {
      section = { part: block.part, items: [] };
      sections.push(section);
    }
    const last = section.items.at(-1);
    const tableKey = block.table
      ? `${block.blockId.slice(0, block.blockId.indexOf(":"))}:${block.table.tableIndex}`
      : null;
    if (tableKey && last?.kind === "table" && last.key === tableKey) {
      last.blocks.push(block);
    } else if (tableKey) {
      section.items.push({ kind: "table", key: tableKey, blocks: [block] });
    } else {
      section.items.push({ kind: "paragraph", block });
    }
  }
  return sections;
}

function preview(text: string): string {
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}

function Segments({ segments }: { segments: Segment[] }) {
  return segments.map((segment) => (
    <span
      key={segment.start}
      data-start={segment.start}
      className={
        [
          segment.bold && "marking-doc__bold",
          segment.italic && "marking-doc__italic",
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      {segment.text}
    </span>
  ));
}

export function MarkingDocument({
  blocks,
  marks,
  labels,
  repeatingRow,
  onSelect,
  onProblem,
  onRemove,
}: MarkingDocumentProps) {
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
    blockElement(target.blockId)
      ?.querySelector<HTMLButtonElement>(".marking-doc__focus")
      ?.focus();
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
              <Segments
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
                <Segments segments={piece.segments} />
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
              {source === "lawyer" && <Segments segments={piece.segments} />}
              <span className="marking-doc__tag" aria-hidden="true">
                {label}
              </span>
              {source === "lawyer" && (
                <button
                  type="button"
                  className="marking-doc__remove"
                  aria-label={`Quitar el marcador ${label} de «${preview(piece.text)}»`}
                  onClick={() => onRemove(mark)}
                >
                  Quitar
                </button>
              )}
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
                blockElement(block.blockId)
                  ?.querySelector<HTMLButtonElement>(".marking-doc__focus")
                  ?.focus();
              }
            }}
          />
        )}
      </div>
    );
  }

  function renderTable(item: Extract<Item, { kind: "table" }>): ReactNode {
    const rows = new Map<number, Map<number, DocumentBlock[]>>();
    let columns = 0;
    for (const block of item.blocks) {
      const { rowIndex, colIndex } = block.table!;
      const row = rows.get(rowIndex) ?? new Map<number, DocumentBlock[]>();
      row.set(colIndex, [...(row.get(colIndex) ?? []), block]);
      rows.set(rowIndex, row);
      columns = Math.max(columns, colIndex + 1);
    }
    return (
      <div key={item.key} className="marking-doc__table-wrap">
        <table className="marking-doc__table">
          <tbody>
            {[...rows.entries()]
              .sort(([a], [b]) => a - b)
              .map(([rowIndex, cells]) => {
                const firstBlock = [...cells.values()][0][0];
                const repeats = rowKey(firstBlock) === repeatingRow;
                return (
                  <tr key={rowIndex} data-repeats={repeats || undefined}>
                    {Array.from({ length: columns }, (_, colIndex) => (
                      <td key={colIndex}>
                        {(cells.get(colIndex) ?? []).map(renderBlock)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
        {item.blocks.some((block) => rowKey(block) === repeatingRow) && (
          <p className="marking-doc__repeat-note">
            La fila resaltada se repite una vez por cada año cobrado.
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
    ref.current?.focus();
  }, []);

  function choose() {
    const box = ref.current;
    if (!box) return;
    if (box.selectionStart === box.selectionEnd) {
      onEmpty();
      box.focus();
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
