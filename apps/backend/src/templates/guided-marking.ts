import {
  DOMParser,
  XMLSerializer,
  type Document,
  type Element,
  type Node,
} from '@xmldom/xmldom';
import type { PdfDocumentType } from '@prisma/client';
import PizZip from 'pizzip';
import { CodedError } from '../common/errors/coded-error.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { buildTemplateCatalog } from './template-catalog.js';
import { CATALOGS, type FieldCatalog } from './validate-template-fields.js';

// Guided marking (Confluence "Contrato del marcado guiado de plantillas"):
// lists the paragraphs of a .docx as blocks and turns the text the lawyer
// selected into {markers}. Pure functions over the file: no database, no HTTP.

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const PART_NAME = /^word\/(header|footer)(\d+)\.xml$/;

export const MAX_SELECTIONS = 500;

/** Text from `start` (included) to `end` (excluded) of one block, in UTF-16 units. */
export interface Selection {
  blockId: string;
  start: number;
  end: number;
  field: string;
}

export interface Fragment {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface CellPosition {
  tableIndex: number;
  rowIndex: number;
  colIndex: number;
}

export type PartKind = 'header' | 'body' | 'footer';

export interface DocxBlock {
  blockId: string;
  part: PartKind;
  text: string;
  table: CellPosition | null;
  fragments: Fragment[];
}

export interface DocxContent {
  blocks: DocxBlock[];
  /** The {markers} the file already has; they are kept on every apply. */
  appliedMarkers: Selection[];
}

interface Paragraph {
  blockId: string;
  part: PartKind;
  doc: Document;
  texts: Element[];
  text: string;
  /** Text boxes are out of scope: their paragraphs are never blocks. */
  inTextBox: boolean;
  row: Element | null;
  table: CellPosition | null;
}

interface Part {
  name: string;
  doc: Document;
  paragraphs: Paragraph[];
}

function wordElements(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagNameNS(W, name));
}

function wordChildren(parent: Element, name: string): Element[] {
  return Array.from(parent.childNodes).filter(
    (node): node is Element =>
      node.nodeType === 1 &&
      (node as Element).namespaceURI === W &&
      (node as Element).localName === name,
  );
}

function closest(node: Node, name: string): Element | null {
  for (let current = node.parentNode; current; current = current.parentNode) {
    if (
      current.nodeType === 1 &&
      (current as Element).namespaceURI === W &&
      (current as Element).localName === name
    ) {
      return current as Element;
    }
  }
  return null;
}

function notDocx(message: string, cause?: unknown): CodedError {
  return new CodedError(ErrorCode.TEMPLATE_NOT_DOCX, message, undefined, {
    cause,
  });
}

function parseXml(xml: string): Document {
  return new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') throw new Error(message);
    },
  }).parseFromString(xml, 'text/xml');
}

function cellPosition(cell: Element, tables: Element[]): CellPosition {
  const row = closest(cell, 'tr')!;
  const table = closest(row, 'tbl')!;
  return {
    tableIndex: tables.indexOf(table),
    rowIndex: wordChildren(table, 'tr').indexOf(row),
    colIndex: wordChildren(row, 'tc').indexOf(cell),
  };
}

// Headers first, then the body, then the footers, as the lawyer reads them.
function loadParts(docx: Buffer): { zip: PizZip; parts: Part[] } {
  let zip: PizZip;
  try {
    zip = new PizZip(docx);
  } catch (error) {
    throw notDocx('The file is not a valid .docx.', error);
  }
  const order = (name: string) => {
    const match = PART_NAME.exec(name);
    if (!match) return [1, 0];
    return [match[1] === 'header' ? 0 : 2, Number(match[2])];
  };
  const names = Object.keys(zip.files)
    .filter((name) => name === 'word/document.xml' || PART_NAME.test(name))
    .sort((a, b) => {
      const [kindA, numberA] = order(a);
      const [kindB, numberB] = order(b);
      return kindA - kindB || numberA - numberB;
    });
  if (!names.includes('word/document.xml')) {
    throw notDocx('The file is a zip but has no Word document inside.');
  }

  const parts = names.map((name) => {
    let doc: Document;
    try {
      doc = parseXml(zip.file(name)!.asText());
    } catch (error) {
      throw notDocx(`The part ${name} is not well-formed XML.`, error);
    }
    const match = PART_NAME.exec(name);
    const part: PartKind = match ? (match[1] as PartKind) : 'body';
    const prefix = match ? `${match[1]}${match[2]}` : 'body';
    const tables = wordElements(doc, 'tbl');
    const paragraphs = wordElements(doc, 'p').map((p, index): Paragraph => {
      const texts = wordElements(p, 't').filter((t) => closest(t, 'p') === p);
      const cell = closest(p, 'tc');
      return {
        blockId: `${prefix}:p${index}`,
        part,
        doc,
        texts,
        text: texts.map((t) => t.textContent ?? '').join(''),
        inTextBox: closest(p, 'txbxContent') !== null,
        row: cell && closest(cell, 'tr'),
        table: cell && cellPosition(cell, tables),
      };
    });
    return { name, doc, paragraphs };
  });
  return { zip, parts };
}

function catalogOf(type: PdfDocumentType): FieldCatalog {
  const catalog = CATALOGS[type];
  if (!catalog) {
    throw new Error(`There is no field catalog for ${type} templates yet.`);
  }
  return catalog;
}

function isOn(runProperties: Element | undefined, name: string): boolean {
  const flag = runProperties && wordChildren(runProperties, name)[0];
  if (!flag) return false;
  const value = flag.getAttributeNS(W, 'val');
  return value !== 'false' && value !== '0';
}

function fragmentsOf(paragraph: Paragraph): Fragment[] {
  const fragments: Fragment[] = [];
  for (const t of paragraph.texts) {
    const text = t.textContent ?? '';
    if (!text) continue;
    const properties = wordChildren(t.parentNode as Element, 'rPr')[0];
    const bold = isOn(properties, 'b');
    const italic = isOn(properties, 'i');
    const last = fragments.at(-1);
    if (last && last.bold === bold && last.italic === italic) {
      last.text += text;
    } else {
      fragments.push({ text, bold, italic });
    }
  }
  return fragments;
}

// The field each existing {marker} stands for, in catalog terms: loop tags
// name the loop, fields inside a table loop are "loop.field" and the inner
// fields of an inline list belong to the list. Loops span paragraphs (a table
// row), so the open loops are tracked across the whole part.
function existingMarkers(part: Part, catalog: FieldCatalog): Selection[] {
  const markers: Selection[] = [];
  const open: string[] = [];
  for (const paragraph of part.paragraphs) {
    for (const match of paragraph.text.matchAll(/\{([^{}]*)\}/g)) {
      const tag = match[1]!.trim();
      let field: string;
      if (tag.startsWith('#') || tag.startsWith('/')) {
        field = tag.slice(1).trim();
        const at = open.lastIndexOf(field);
        if (tag.startsWith('#')) open.push(field);
        else if (at >= 0) open.splice(at, 1);
      } else {
        const loop = open.findLast((name) => name in catalog.loops);
        field =
          loop && catalog.loops[loop]!.includes(tag)
            ? catalog.meta[loop]?.kind === 'INLINE_LIST'
              ? loop
              : `${loop}.${tag}`
            : tag;
      }
      if (paragraph.inTextBox) continue;
      markers.push({
        blockId: paragraph.blockId,
        start: match.index,
        end: match.index + match[0].length,
        field,
      });
    }
  }
  return markers;
}

export function readDocxContent(
  docx: Buffer,
  type: PdfDocumentType,
): DocxContent {
  const catalog = catalogOf(type);
  const { parts } = loadParts(docx);
  return {
    blocks: parts.flatMap((part) =>
      part.paragraphs
        .filter((paragraph) => !paragraph.inTextBox && paragraph.text !== '')
        .map((paragraph) => ({
          blockId: paragraph.blockId,
          part: paragraph.part,
          text: paragraph.text,
          table: paragraph.table,
          fragments: fragmentsOf(paragraph),
        })),
    ),
    appliedMarkers: parts.flatMap((part) => existingMarkers(part, catalog)),
  };
}

function invalid(index: number | undefined, reason: string): CodedError {
  return index === undefined
    ? new CodedError(
        ErrorCode.TEMPLATE_SELECTION_INVALID,
        `The selections are not valid: ${reason}.`,
        { reason },
      )
    : new CodedError(
        ErrorCode.TEMPLATE_SELECTION_INVALID,
        `Selection ${index} is not valid: ${reason}.`,
        { index, reason },
      );
}

function setText(t: Element, text: string): void {
  t.textContent = text;
  // Without it Word and LibreOffice drop leading and trailing spaces.
  t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
}

// Writes `replacement` where the selection starts, in the text node that holds
// its first character, so it keeps that fragment's formatting even when Word
// split the selected text across several runs; the following nodes only lose
// the selected part.
function replaceRange(
  texts: Element[],
  start: number,
  end: number,
  replacement: string,
): void {
  let offset = 0;
  let written = false;
  for (const t of texts) {
    const value = t.textContent ?? '';
    const from = offset;
    offset += value.length;
    if (offset <= start || from >= end) continue;
    const cut = Math.max(start - from, 0);
    const keep = Math.min(end - from, value.length);
    setText(
      t,
      value.slice(0, cut) + (written ? '' : replacement) + value.slice(keep),
    );
    written = true;
  }
}

// '' for the table loop itself: choosing it only makes its row repeat.
function markerFor(field: string, catalog: FieldCatalog): string {
  const dot = field.indexOf('.');
  if (dot >= 0) return `{${field.slice(dot + 1)}}`;
  if (catalog.meta[field]?.kind === 'INLINE_LIST') {
    const fields = catalog.loops[field]!.map((name) => `{${name}}`).join('');
    return `{#${field}}${fields}{/${field}}`;
  }
  return field in catalog.loops ? '' : `{${field}}`;
}

// Makes the table row repeat once per item: {#rows} opens its first cell and
// {/rows} closes its last one, the shape of the official Páez template.
function wrapRow(row: Element, loop: string, doc: Document): void {
  const texts = wordElements(row, 't');
  if (texts.some((t) => t.textContent?.includes(`{#${loop}}`))) return;
  const cells = wordChildren(row, 'tc');
  const textIn = (cell: Element, last: boolean): Element => {
    const found = wordElements(cell, 't');
    if (found.length > 0) return found[last ? found.length - 1 : 0]!;
    const run = doc.createElementNS(W, 'w:r');
    const t = doc.createElementNS(W, 'w:t');
    run.appendChild(t);
    wordElements(cell, 'p')[0]!.appendChild(run);
    return t;
  };
  const first = textIn(cells[0]!, false);
  setText(first, `{#${loop}}${first.textContent ?? ''}`);
  const last = textIn(cells.at(-1)!, true);
  setText(last, `${last.textContent ?? ''}{/${loop}}`);
}

function overlaps(a: { start: number; end: number }, b: typeof a): boolean {
  return a.start < b.end && b.start < a.end;
}

// Applies the selections to the original file and returns the marked copy.
// Every selection is validated before anything changes, so a rejected request
// never yields a half-marked document. The markers the file already had stay.
export function applySelections(
  docx: Buffer,
  type: PdfDocumentType,
  selections: readonly Selection[],
): Buffer {
  const catalog = catalogOf(type);
  if (selections.length > MAX_SELECTIONS) throw invalid(undefined, 'TOO_MANY');
  const kinds = new Map(
    buildTemplateCatalog(type).map((entry) => [entry.key, entry.kind]),
  );
  const { zip, parts } = loadParts(docx);
  const blocks = new Map(
    parts
      .flatMap((part) => part.paragraphs)
      .filter((paragraph) => !paragraph.inTextBox)
      .map((paragraph) => [paragraph.blockId, paragraph]),
  );

  let tableRow: { index: number; row: Element; table: number } | undefined;
  selections.forEach((selection, index) => {
    const kind = kinds.get(selection.field);
    if (!kind) {
      throw new CodedError(
        ErrorCode.TEMPLATE_FIELD_UNKNOWN,
        `"${selection.field}" is not a ${type} field.`,
        { index, field: selection.field },
      );
    }
    const paragraph = blocks.get(selection.blockId);
    if (!paragraph) {
      throw new CodedError(
        ErrorCode.TEMPLATE_BLOCK_NOT_FOUND,
        `Block ${selection.blockId} does not exist in the document.`,
        { index, blockId: selection.blockId },
      );
    }
    if (selection.start >= selection.end) throw invalid(index, 'EMPTY');
    if (selection.start < 0 || selection.end > paragraph.text.length) {
      throw invalid(index, 'OUT_OF_RANGE');
    }
    if (kind !== 'TABLE_ROW') return;
    if (!paragraph.row || !paragraph.table) {
      throw invalid(index, 'ROW_FIELD_OUTSIDE_TABLE');
    }
    if (!tableRow) {
      tableRow = {
        index,
        row: paragraph.row,
        table: paragraph.table.tableIndex,
      };
    } else if (tableRow.row !== paragraph.row) {
      // tableIndex counts per part, so a row of another part is another table.
      const sameTable =
        tableRow.table === paragraph.table.tableIndex &&
        tableRow.row.ownerDocument === paragraph.row.ownerDocument;
      throw invalid(
        index,
        sameTable ? 'ROWS_IN_SEVERAL_ROWS' : 'ROWS_IN_SEVERAL_TABLES',
      );
    }
  });

  const existing = parts.flatMap((part) => existingMarkers(part, catalog));
  const byBlock = new Map<string, (Selection & { index: number })[]>();
  selections.forEach((selection, index) => {
    const group = byBlock.get(selection.blockId) ?? [];
    group.push({ ...selection, index });
    byBlock.set(selection.blockId, group);
  });
  for (const [blockId, group] of byBlock) {
    const sorted = group.toSorted((a, b) => a.start - b.start);
    sorted.slice(1).forEach((selection, i) => {
      if (overlaps(sorted[i]!, selection)) {
        throw new CodedError(
          ErrorCode.TEMPLATE_SELECTION_OVERLAP,
          'Two selections overlap.',
          { indexes: [sorted[i]!.index, selection.index] },
        );
      }
    });
    const marker = existing.find(
      (m) =>
        m.blockId === blockId &&
        group.some((selection) => overlaps(m, selection)),
    );
    if (marker) {
      const hit = group.find((selection) => overlaps(marker, selection))!;
      throw new CodedError(
        ErrorCode.TEMPLATE_SELECTION_OVERLAP,
        'A selection overlaps a marker the document already has.',
        { indexes: [hit.index] },
      );
    }
  }

  const changed = new Set<Part>();
  for (const [blockId, group] of byBlock) {
    const paragraph = blocks.get(blockId)!;
    // From the end backwards, so the offsets of the earlier ones still hold.
    for (const selection of group.toSorted((a, b) => b.start - a.start)) {
      const replacement = markerFor(selection.field, catalog);
      if (replacement) {
        replaceRange(
          paragraph.texts,
          selection.start,
          selection.end,
          replacement,
        );
      }
    }
    changed.add(parts.find((part) => part.doc === paragraph.doc)!);
  }
  if (tableRow) {
    const loop = Object.keys(catalog.loops).find(
      (name) => catalog.meta[name]?.kind === 'TABLE_ROW',
    )!;
    wrapRow(tableRow.row, loop, tableRow.row.ownerDocument!);
  }

  const serializer = new XMLSerializer();
  for (const part of changed) {
    zip.file(part.name, serializer.serializeToString(part.doc));
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
