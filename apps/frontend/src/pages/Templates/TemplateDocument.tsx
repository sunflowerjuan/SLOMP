import type { ReactNode } from "react";
import type { DocumentBlock, TemplateContent } from "../../api/templates";
import {
  blockPieces,
  isRowBoundary,
  mergeAdjacent,
  repeatingRows,
  rowKey,
  sectionsOf,
  tableGrid,
} from "../../domain/templateMarking";
import type { MarkSource } from "../../domain/templateMarking";
import { DocumentSegments } from "./DocumentSegments";
import { PART_LABEL } from "./documentText";
import "./GuidedMarking.css";

const SAVED: MarkSource = "file";

// A saved version to read, with nothing to select or change: every marker by
// its Spanish name, in the place of the tag the file has there.
export function TemplateDocument({ content }: { content: TemplateContent }) {
  const { blocks, appliedMarkers } = content;
  const labels = new Map(
    appliedMarkers.map((marker) => [marker.field, marker.label]),
  );
  const merged = mergeAdjacent(appliedMarkers);
  const marks = merged.map((mark) => ({ mark, source: SAVED }));
  const repeating = repeatingRows(blocks, merged);

  function renderBlock(block: DocumentBlock): ReactNode {
    return (
      <div key={block.blockId} className="marking-doc__block">
        {blockPieces(block, marks).map((piece) => {
          if (piece.kind === "text") {
            return (
              <DocumentSegments
                key={`t${piece.segments[0]?.start ?? 0}`}
                segments={piece.segments}
              />
            );
          }
          if (isRowBoundary(piece.text)) return null;
          return (
            <mark
              key={`m${piece.mark.start}`}
              className="marking-doc__mark"
              data-source={SAVED}
              data-field={piece.mark.field}
            >
              <span className="marking-doc__tag">
                {labels.get(piece.mark.field) ?? "Marcador"}
              </span>
            </mark>
          );
        })}
      </div>
    );
  }

  function renderTable(key: string, cellBlocks: DocumentBlock[]): ReactNode {
    const { rows, columns } = tableGrid(cellBlocks);
    const rowKeys = rows.map(({ cells }) =>
      rowKey([...cells.values()].flat()[0])!,
    );
    return (
      <div key={key} className="marking-doc__table-wrap">
        <table className="marking-doc__table">
          <tbody>
            {rows.map(({ rowIndex, cells }, index) => (
              <tr
                key={rowIndex}
                data-repeats={repeating.has(rowKeys[index]) || undefined}
              >
                {Array.from({ length: columns }, (_, colIndex) => (
                  <td key={colIndex}>
                    {(cells.get(colIndex) ?? []).map(renderBlock)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rowKeys.some((row) => repeating.has(row)) && (
          <p className="marking-doc__repeat-note">
            Esta fila se repite por cada vigencia y concepto que se cobre.
          </p>
        )}
      </div>
    );
  }

  const sections = sectionsOf(blocks);
  const labelled = sections.some((section) => section.part !== "body");

  return (
    <div className="marking-doc template-document">
      {sections.map((section, index) => (
        <section
          // Parts repeat (several headers); their order never changes.
          key={`${section.part}${index}`}
          className="marking-doc__part"
          aria-label={PART_LABEL[section.part]}
        >
          {labelled && (
            <p className="marking-doc__part-label" aria-hidden="true">
              {PART_LABEL[section.part]}
            </p>
          )}
          {section.items.map((item) =>
            item.kind === "table"
              ? renderTable(item.key, item.blocks)
              : renderBlock(item.block),
          )}
        </section>
      ))}
    </div>
  );
}
