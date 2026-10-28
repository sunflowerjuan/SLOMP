import type {
  DocumentBlock,
  MarkerCatalogEntry,
  MarkerSelection,
  TextFragment,
} from "../api/templates";

// Guided marking rules the screen checks before anything reaches the backend
// (which checks them again): what can be marked where, which required markers
// are still missing, and how a paragraph splits into plain text and marks.

// Why a selection can't take a marker. The wording is in errorMessages.ts.
export type MarkingProblem =
  | "CROSSES_BLOCKS"
  | "EMPTY"
  | "OVERLAP"
  | "OUTSIDE_TABLE"
  | "OTHER_ROW"
  | "IN_REMOVED_ROW";

// The name a template is saved under, as the backend takes it.
export const MAX_TEMPLATE_NAME_LENGTH = 120;

export type TemplateNameProblem = "EMPTY" | "TOO_LONG" | "FORBIDDEN";

// "Liquidación Páez.docx" -> "Liquidación Páez": the name is edited without
// its extension, which the backend adds.
export function templateNameOf(fileName: string): string {
  return fileName.replace(/\.docx$/i, "");
}

export function templateNameProblem(name: string): TemplateNameProblem | null {
  const trimmed = templateNameOf(name.trim()).trim();
  if (trimmed === "") return "EMPTY";
  if (trimmed.length > MAX_TEMPLATE_NAME_LENGTH) return "TOO_LONG";
  // eslint-disable-next-line no-control-regex
  if (/[/\\\u0000-\u001f\u007f]/.test(trimmed)) return "FORBIDDEN";
  return null;
}

export interface TextRange {
  blockId: string;
  start: number;
  end: number;
}

// The table itself (`rows`): it is never picked from the menu. Marking any
// field of its example row is what makes that row repeat once per year.
export function isTableLoop(entry: MarkerCatalogEntry): boolean {
  return entry.kind === "TABLE_ROW" && !entry.key.includes(".");
}

export function isTableField(entry: MarkerCatalogEntry): boolean {
  return entry.kind === "TABLE_ROW" && entry.key.includes(".");
}

// The loop a table field belongs to: "rows" for "rows.year".
function loopOf(field: string): string | null {
  const dot = field.indexOf(".");
  return dot >= 0 ? field.slice(0, dot) : null;
}

// Every marker the template will have, the file's own and the lawyer's; a
// table field also counts as its table.
export function usedFields(
  selections: readonly MarkerSelection[],
  applied: readonly MarkerSelection[],
): Set<string> {
  const used = new Set<string>();
  for (const { field } of [...applied, ...selections]) {
    used.add(field);
    const loop = loopOf(field);
    if (loop) used.add(loop);
  }
  return used;
}

export interface RequiredProgress {
  done: number;
  total: number;
  missing: MarkerCatalogEntry[];
}

export function requiredProgress(
  catalog: readonly MarkerCatalogEntry[],
  used: ReadonlySet<string>,
): RequiredProgress {
  const required = catalog.filter((entry) => entry.required);
  const missing = required.filter((entry) => !used.has(entry.key));
  return {
    done: required.length - missing.length,
    total: required.length,
    missing,
  };
}

// "3 de 5 obligatorios".
export function progressText({ done, total }: RequiredProgress): string {
  return `${done} de ${total} obligatorios`;
}

// A table row, unique in the whole document: table indexes count per part
// (header1, body, footer2...), and the part is the prefix of the block id.
export function rowKey(block: DocumentBlock): string | null {
  if (!block.table) return null;
  const part = block.blockId.slice(0, block.blockId.indexOf(":"));
  return `${part}:${block.table.tableIndex}:${block.table.rowIndex}`;
}

// The table a row belongs to: "body:0:2" -> "body:0".
export function tableKeyOf(row: string): string {
  return row.slice(0, row.lastIndexOf(":"));
}

// The columns of a row that have text.
function filledColumns(
  blocks: readonly DocumentBlock[],
  row: string,
): Set<number> {
  return new Set(
    blocks
      .filter((block) => rowKey(block) === row && block.text.trim() !== "")
      .map((block) => block.table!.colIndex),
  );
}

export interface TableRow {
  row: string;
  // One of its blocks, the way the backend names a row to remove.
  blockId: string;
}

// The other rows of the example row's table that look like more example
// values: the same columns filled in, other than the table's first row (its
// titles). Left there, they would print as they are in every document, so
// the lawyer is offered to remove them. A row with a marker never counts.
export function surplusRows(
  blocks: readonly DocumentBlock[],
  exampleRow: string,
  marks: readonly MarkerSelection[],
): TableRow[] {
  const table = tableKeyOf(exampleRow);
  const example = filledColumns(blocks, exampleRow);
  const marked = new Set(
    marks.map((mark) => {
      const block = blocks.find(
        (candidate) => candidate.blockId === mark.blockId,
      );
      return block ? rowKey(block) : null;
    }),
  );
  const rows: TableRow[] = [];
  for (const block of blocks) {
    const row = rowKey(block);
    if (
      !row ||
      tableKeyOf(row) !== table ||
      row === exampleRow ||
      block.table!.rowIndex === 0 ||
      marked.has(row) ||
      rows.some((known) => known.row === row)
    ) {
      continue;
    }
    const filled = filledColumns(blocks, row);
    if (
      filled.size === example.size &&
      [...example].every((column) => filled.has(column))
    ) {
      rows.push({ row, blockId: block.blockId });
    }
  }
  return rows;
}

// The example row the table fields already use, if any: the backend repeats a
// single row, so every table field has to go in that one.
export function tableRowInUse(
  blocks: readonly DocumentBlock[],
  catalog: readonly MarkerCatalogEntry[],
  marks: readonly MarkerSelection[],
): string | null {
  const tableKeys = new Set(
    catalog
      .filter((entry) => entry.kind === "TABLE_ROW")
      .map((entry) => entry.key),
  );
  for (const mark of marks) {
    if (!tableKeys.has(mark.field)) continue;
    const block = blocks.find(
      (candidate) => candidate.blockId === mark.blockId,
    );
    const key = block && rowKey(block);
    if (key) return key;
  }
  return null;
}

// Leaves out the spaces at either end, which a double click often takes: the
// marker replaces the words, not the space around them. Null when only
// spaces were selected.
export function trimRange(
  text: string,
  start: number,
  end: number,
): { start: number; end: number } | null {
  let from = Math.max(0, Math.min(start, end));
  let to = Math.min(text.length, Math.max(start, end));
  while (from < to && /\s/.test(text[from])) from += 1;
  while (to > from && /\s/.test(text[to - 1])) to -= 1;
  return from < to ? { start: from, end: to } : null;
}

function overlaps(a: TextRange, b: TextRange): boolean {
  return a.blockId === b.blockId && a.start < b.end && b.start < a.end;
}

// A selection may not touch a marker that is already there.
export function rangeProblem(
  range: TextRange,
  marks: readonly MarkerSelection[],
): MarkingProblem | null {
  return marks.some((mark) => overlaps(mark, range)) ? "OVERLAP" : null;
}

// Why `entry` can't go on `block`, or null when it can.
export function entryProblem(
  entry: MarkerCatalogEntry,
  block: DocumentBlock,
  rowInUse: string | null,
): MarkingProblem | null {
  if (!isTableField(entry)) return null;
  const row = rowKey(block);
  if (!row) return "OUTSIDE_TABLE";
  if (rowInUse && rowInUse !== row) return "OTHER_ROW";
  return null;
}

// The file's own markers as the lawyer should see them: an inline list comes
// as four tags ({#list}{number}{separator}{/list}) that read as one marker.
export function mergeAdjacent(
  marks: readonly MarkerSelection[],
): MarkerSelection[] {
  const sorted = marks.toSorted(
    (a, b) => a.blockId.localeCompare(b.blockId) || a.start - b.start,
  );
  const merged: MarkerSelection[] = [];
  for (const mark of sorted) {
    const last = merged.at(-1);
    if (
      last &&
      last.blockId === mark.blockId &&
      last.field === mark.field &&
      last.end === mark.start
    ) {
      last.end = mark.end;
    } else {
      merged.push({ ...mark });
    }
  }
  return merged;
}

export interface Segment extends TextFragment {
  // Offset of the segment's first character in the block's text.
  start: number;
}

// The fragments between `start` and `end`, cut at those offsets.
export function segmentsBetween(
  fragments: readonly TextFragment[],
  start: number,
  end: number,
): Segment[] {
  const segments: Segment[] = [];
  let offset = 0;
  for (const fragment of fragments) {
    const from = offset;
    offset += fragment.text.length;
    if (offset <= start || from >= end) continue;
    const cut = Math.max(start - from, 0);
    const keep = Math.min(end - from, fragment.text.length);
    segments.push({
      text: fragment.text.slice(cut, keep),
      bold: fragment.bold,
      italic: fragment.italic,
      start: from + cut,
    });
  }
  return segments;
}

// "pending": the text selected while the lawyer picks its marker.
export type MarkSource = "file" | "lawyer" | "pending";

export type BlockPiece =
  | { kind: "text"; segments: Segment[] }
  | {
      kind: "mark";
      source: MarkSource;
      mark: MarkerSelection;
      text: string;
      segments: Segment[];
    };

// A paragraph as plain text with its marks in between, in reading order.
// Marks never overlap (rangeProblem keeps it so).
export function blockPieces(
  block: DocumentBlock,
  marks: readonly { mark: MarkerSelection; source: MarkSource }[],
): BlockPiece[] {
  const own = marks
    .filter(({ mark }) => mark.blockId === block.blockId)
    .toSorted((a, b) => a.mark.start - b.mark.start);
  const pieces: BlockPiece[] = [];
  let cursor = 0;
  const pushText = (until: number) => {
    if (until <= cursor) return;
    pieces.push({
      kind: "text",
      segments: segmentsBetween(block.fragments, cursor, until),
    });
  };
  for (const { mark, source } of own) {
    pushText(mark.start);
    pieces.push({
      kind: "mark",
      source,
      mark,
      text: block.text.slice(mark.start, mark.end),
      segments: segmentsBetween(block.fragments, mark.start, mark.end),
    });
    cursor = Math.max(cursor, mark.end);
  }
  pushText(block.text.length);
  return pieces;
}

// The Spanish names of the markers a saved version has, in catalog order. The
// inner fields of an inline list (`liquidations.number`) are not in the
// catalog: they read as the list itself.
export function fieldLabels(
  fields: readonly string[],
  catalog: readonly MarkerCatalogEntry[],
): string[] {
  const keys = new Set(
    fields.map((field) =>
      catalog.some((entry) => entry.key === field)
        ? field
        : (loopOf(field) ?? field),
    ),
  );
  return catalog
    .filter((entry) => keys.has(entry.key))
    .map((entry) => entry.label);
}

export function sameRange(a: TextRange, b: TextRange): boolean {
  return a.blockId === b.blockId && a.start === b.start && a.end === b.end;
}

// The lawyer's selections in document order, so a stored draft and the
// request body don't depend on the order things were marked in.
export function sortSelections(
  blocks: readonly DocumentBlock[],
  selections: readonly MarkerSelection[],
): MarkerSelection[] {
  const order = new Map(blocks.map((block, index) => [block.blockId, index]));
  return selections.toSorted(
    (a, b) =>
      (order.get(a.blockId) ?? 0) - (order.get(b.blockId) ?? 0) ||
      a.start - b.start,
  );
}
