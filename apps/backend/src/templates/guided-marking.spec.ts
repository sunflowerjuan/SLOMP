import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import { extractTemplateFields } from './extract-template-fields.js';
import {
  applySelections,
  MAX_SELECTIONS,
  readDocxContent,
  type Selection,
} from './guided-marking.js';
import { PREVIEW_DATA } from './template-preview-data.js';
import {
  buildDocx,
  docxFromXml,
  paragraphXml,
  partXml,
  tableXml,
} from './test-docx.js';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

const textOf = (docx: Buffer, blockId: string) =>
  readDocxContent(docx, 'LIQUIDACION').blocks.find(
    (block) => block.blockId === blockId,
  )?.text;

const fieldsOf = (docx: Buffer, loops: string[] = ['rows']) =>
  extractTemplateFields(docx, loops).sort();

// Fills the marked file the way the PDF service does, to prove it renders.
function render(docx: Buffer, data: object): string {
  const document = new Docxtemplater(new PizZip(docx), { paragraphLoop: true });
  document.render(data);
  return document.getFullText();
}

function codeOf(run: () => unknown) {
  try {
    run();
  } catch (error) {
    const { code, details } = error as { code: string; details?: unknown };
    return { code, details };
  }
  throw new Error('expected an error');
}

// Header with a text box, a body with a table of periods, and a footer.
const TEXT_BOX = `<w:p><w:r><w:t>Logo </w:t></w:r><w:r><w:drawing><w:txbxContent>${paragraphXml('Texto en cuadro')}</w:txbxContent></w:drawing></w:r></w:p>`;
const PERIODS = tableXml([
  ['Año', 'Cobro', 'Interés', 'Capital'],
  ['2024', 'Impuesto predial', '$80.000', '$350.000'],
  ['TOTAL', '', '', '$1.250.000'],
]);
const DOCX = docxFromXml(
  [
    paragraphXml('RESOLUCIÓN 045 DE 2025'),
    paragraphXml([
      'Predio con número ',
      '**00-01-**',
      '**0001-0001**',
      '**-000**',
      ' ubicado en Lote El Ejemplo',
    ]),
    PERIODS,
    paragraphXml('Del predio 00-01-0001-0001-000 por un total de $1.250.000'),
    paragraphXml(''),
  ].join(''),
  {
    'word/header1.xml': partXml('hdr', TEXT_BOX),
    'word/footer1.xml': partXml('ftr', paragraphXml('Municipio de Páez')),
  },
);

describe('readDocxContent', () => {
  const content = readDocxContent(DOCX, 'LIQUIDACION');

  it('lists the paragraphs with text in reading order, header first and footer last', () => {
    expect(content.blocks.map((block) => block.blockId)).toEqual([
      'header1:p0',
      'body:p0',
      'body:p1',
      'body:p2',
      'body:p3',
      'body:p4',
      'body:p5',
      'body:p6',
      'body:p7',
      'body:p8',
      'body:p9',
      'body:p10',
      'body:p13',
      'body:p14',
      'footer1:p0',
    ]);
    expect(content.blocks[0]).toMatchObject({ part: 'header', text: 'Logo ' });
    expect(content.blocks.at(-1)).toMatchObject({
      part: 'footer',
      text: 'Municipio de Páez',
    });
  });

  it('leaves out the paragraphs of text boxes but still counts them in the ids', () => {
    expect(content.blocks.map((block) => block.text)).not.toContain(
      'Texto en cuadro',
    );
  });

  it('gives the cell of table paragraphs and null for the rest', () => {
    const year = content.blocks.find((block) => block.text === '2024');
    expect(year).toMatchObject({
      blockId: 'body:p6',
      table: { tableIndex: 0, rowIndex: 1, colIndex: 0 },
    });
    expect(content.blocks[1]!.table).toBeNull();
  });

  it('joins the runs Word split and reports the bold fragments', () => {
    const block = content.blocks.find((b) => b.blockId === 'body:p1')!;
    expect(block.text).toBe(
      'Predio con número 00-01-0001-0001-000 ubicado en Lote El Ejemplo',
    );
    expect(block.fragments).toEqual([
      { text: 'Predio con número ', bold: false, italic: false },
      { text: '00-01-0001-0001-000', bold: true, italic: false },
      { text: ' ubicado en Lote El Ejemplo', bold: false, italic: false },
    ]);
  });

  it('reports the markers the document already has, with their catalog field', () => {
    const marked = buildDocx([
      'RESOLUCION {resolutionNumber}',
      ['numero {cadas', 'tralCode}{#owners} a {owners}{/owners}'],
      '{#rows}{year} {capital}{/rows}',
    ]);
    expect(readDocxContent(marked, 'LIQUIDACION').appliedMarkers).toEqual([
      { blockId: 'body:p0', start: 11, end: 29, field: 'resolutionNumber' },
      { blockId: 'body:p1', start: 7, end: 22, field: 'cadastralCode' },
      { blockId: 'body:p1', start: 22, end: 31, field: 'owners' },
      { blockId: 'body:p1', start: 34, end: 42, field: 'owners' },
      { blockId: 'body:p1', start: 42, end: 51, field: 'owners' },
      { blockId: 'body:p2', start: 0, end: 7, field: 'rows' },
      { blockId: 'body:p2', start: 7, end: 13, field: 'rows.year' },
      { blockId: 'body:p2', start: 14, end: 23, field: 'rows.capital' },
      { blockId: 'body:p2', start: 23, end: 30, field: 'rows' },
    ]);
  });

  it('reports the inner fields of an inline list as the list', () => {
    const marked = buildDocx([
      'liquidaciones {#liquidations}{number}{separator}{/liquidations}',
    ]);
    expect(
      readDocxContent(marked, 'MANDAMIENTO').appliedMarkers.map((m) => m.field),
    ).toEqual(['liquidations', 'liquidations', 'liquidations', 'liquidations']);
  });

  it('rejects a file that is not a .docx', () => {
    expect(
      codeOf(() => readDocxContent(Buffer.from('nope'), 'LIQUIDACION')),
    ).toMatchObject({ code: ErrorCode.TEMPLATE_NOT_DOCX });
  });
});

describe('applySelections', () => {
  const REQUIRED: Selection[] = [
    { blockId: 'body:p0', start: 11, end: 14, field: 'resolutionNumber' },
    { blockId: 'body:p1', start: 18, end: 37, field: 'cadastralCode' },
    { blockId: 'body:p6', start: 0, end: 4, field: 'rows.year' },
    { blockId: 'body:p9', start: 0, end: 8, field: 'rows.capital' },
    { blockId: 'body:p13', start: 0, end: 10, field: 'totalAmount' },
  ];

  it('writes the marker in the first fragment, keeping its format when Word split the text', () => {
    const marked = applySelections(DOCX, 'LIQUIDACION', REQUIRED);
    const block = readDocxContent(marked, 'LIQUIDACION').blocks.find(
      (b) => b.blockId === 'body:p1',
    )!;

    expect(block.text).toBe(
      'Predio con número {cadastralCode} ubicado en Lote El Ejemplo',
    );
    expect(block.fragments).toContainEqual({
      text: '{cadastralCode}',
      bold: true,
      italic: false,
    });
  });

  it('makes the table row repeat and finds every required field', () => {
    const marked = applySelections(DOCX, 'LIQUIDACION', REQUIRED);

    expect(textOf(marked, 'body:p6')).toBe('{#rows}{year}');
    expect(textOf(marked, 'body:p7')).toBe('Impuesto predial');
    expect(textOf(marked, 'body:p9')).toBe('{capital}{/rows}');
    expect(fieldsOf(marked)).toEqual(
      [
        'cadastralCode',
        'resolutionNumber',
        'rows',
        'rows.capital',
        'rows.year',
        'totalAmount',
      ].sort(),
    );
    const text = render(marked, PREVIEW_DATA.LIQUIDACION);
    expect(text).toContain('RES-0001-2026');
    // rows.interest is not selected, so the row keeps its literal $80.000.
    expect(text).toContain('2023Impuesto predial$80.000$300.000');
    expect(text).toContain('2025Impuesto predial$80.000$350.000');
  });

  it('accepts the same field in several selections, also in one paragraph', () => {
    const docx = buildDocx(['Código 123 y otra vez 123', 'Código 123']);
    const marked = applySelections(docx, 'LIQUIDACION', [
      { blockId: 'body:p0', start: 7, end: 10, field: 'cadastralCode' },
      { blockId: 'body:p0', start: 22, end: 25, field: 'cadastralCode' },
      { blockId: 'body:p1', start: 7, end: 10, field: 'cadastralCode' },
    ]);
    expect(textOf(marked, 'body:p0')).toBe(
      'Código {cadastralCode} y otra vez {cadastralCode}',
    );
    expect(textOf(marked, 'body:p1')).toBe('Código {cadastralCode}');
  });

  it('turns the selected text into the inline list of liquidations', () => {
    const docx = buildDocx(['respaldado por LIQ-1, LIQ-2 y LIQ-3.']);
    const marked = applySelections(docx, 'MANDAMIENTO', [
      { blockId: 'body:p0', start: 15, end: 35, field: 'liquidations' },
    ]);
    expect(readDocxContent(marked, 'MANDAMIENTO').blocks[0]!.text).toBe(
      'respaldado por {#liquidations}{number}{separator}{/liquidations}.',
    );
    expect(render(marked, PREVIEW_DATA.MANDAMIENTO)).toBe(
      'respaldado por LIQ-0001-2026, LIQ-0002-2026 y LIQ-0003-2026.',
    );
  });

  it('only marks the row when the table loop itself is chosen', () => {
    const marked = applySelections(DOCX, 'LIQUIDACION', [
      { blockId: 'body:p7', start: 0, end: 8, field: 'rows' },
    ]);
    expect(textOf(marked, 'body:p6')).toBe('{#rows}2024');
    expect(textOf(marked, 'body:p7')).toBe('Impuesto predial');
  });

  it('opens and closes an empty first or last cell with a new run', () => {
    const docx = docxFromXml(tableXml([['', '2024', '']]));
    const marked = applySelections(docx, 'LIQUIDACION', [
      { blockId: 'body:p1', start: 0, end: 4, field: 'rows.year' },
    ]);
    const texts = readDocxContent(marked, 'LIQUIDACION').blocks.map(
      (b) => b.text,
    );
    expect(texts).toEqual(['{#rows}', '{year}', '{/rows}']);
  });

  it('does not wrap again a row that is already a loop', () => {
    const docx = docxFromXml(
      tableXml([['{#rows}{year}', 'Impuesto', '{/rows}']]),
    );
    const marked = applySelections(docx, 'LIQUIDACION', [
      { blockId: 'body:p1', start: 0, end: 8, field: 'rows.concept' },
    ]);
    expect(fieldsOf(marked)).toEqual(['rows', 'rows.concept', 'rows.year']);
  });

  it('leaves the text outside the selections and the untouched parts as they were', () => {
    const marked = applySelections(DOCX, 'LIQUIDACION', REQUIRED);
    const before = readDocxContent(DOCX, 'LIQUIDACION').blocks;
    const after = readDocxContent(marked, 'LIQUIDACION').blocks;

    for (const block of before) {
      const selections = REQUIRED.filter((s) => s.blockId === block.blockId);
      const marker = (s: Selection) =>
        s.field.includes('.') ? `{${s.field.split('.')[1]}}` : `{${s.field}}`;
      let expected = block.text;
      for (const s of selections.toSorted((a, b) => b.start - a.start)) {
        expected =
          expected.slice(0, s.start) + marker(s) + expected.slice(s.end);
      }
      if (block.blockId === 'body:p6') expected = `{#rows}${expected}`;
      if (block.blockId === 'body:p9') expected = `${expected}{/rows}`;
      expect(after.find((b) => b.blockId === block.blockId)?.text).toBe(
        expected,
      );
    }
    const original = new PizZip(DOCX);
    const result = new PizZip(marked);
    for (const name of ['word/header1.xml', 'word/footer1.xml']) {
      expect(result.file(name)!.asText()).toBe(original.file(name)!.asText());
    }
  });

  it('keeps the markers the document already had', () => {
    const docx = buildDocx(['Resolución {resolutionNumber} del predio 123']);
    const marked = applySelections(docx, 'LIQUIDACION', [
      { blockId: 'body:p0', start: 41, end: 44, field: 'cadastralCode' },
    ]);
    expect(fieldsOf(marked)).toEqual(['cadastralCode', 'resolutionNumber']);
  });

  it('returns the document as it was with no selections', () => {
    const marked = applySelections(DOCX, 'LIQUIDACION', []);
    expect(readDocxContent(marked, 'LIQUIDACION')).toEqual(
      readDocxContent(DOCX, 'LIQUIDACION'),
    );
  });

  it('accepts two selections that only touch at the edge', () => {
    const docx = buildDocx(['20232025']);
    const marked = applySelections(docx, 'LIQUIDACION', [
      { blockId: 'body:p0', start: 0, end: 4, field: 'startYear' },
      { blockId: 'body:p0', start: 4, end: 8, field: 'endYear' },
    ]);
    expect(textOf(marked, 'body:p0')).toBe('{startYear}{endYear}');
  });

  describe('removed rows', () => {
    // Header, example row (2024), two more rows of example values, total.
    const FILLED = docxFromXml(
      tableXml([
        ['Año', 'Cobro', 'Interés', 'Capital'],
        ['2024', 'Impuesto predial', '$80.000', '$350.000'],
        ['2024', 'Sobretasa ambiental', '$8.000', '$7.000'],
        ['2025', 'Impuesto predial', '$90.000', '$400.000'],
        ['TOTAL', '$938.000', '', ''],
      ]),
    );
    const blockOf = (docx: Buffer, text: string) =>
      readDocxContent(docx, 'LIQUIDACION').blocks.find(
        (block) => block.text === text,
      )!.blockId;
    const YEAR: Selection = {
      blockId: blockOf(FILLED, '2024'),
      start: 0,
      end: 4,
      field: 'rows.year',
    };
    const reject = (removedRows: string[], docx = FILLED) =>
      codeOf(() => applySelections(docx, 'LIQUIDACION', [YEAR], removedRows))
        .details;

    it('leaves out the rows of example values, so only the example row repeats', () => {
      const marked = applySelections(
        FILLED,
        'LIQUIDACION',
        [YEAR],
        [blockOf(FILLED, 'Sobretasa ambiental'), blockOf(FILLED, '2025')],
      );

      const texts = readDocxContent(marked, 'LIQUIDACION').blocks.map(
        (block) => block.text,
      );
      expect(texts).not.toContain('Sobretasa ambiental');
      expect(texts).not.toContain('2025');
      expect(texts).toEqual(
        expect.arrayContaining(['{#rows}{year}', 'TOTAL', '$938.000']),
      );
      const text = render(marked, PREVIEW_DATA.LIQUIDACION);
      expect(text).not.toContain('Sobretasa ambiental');
      expect(text).toContain('2023Impuesto predial$80.000$350.000');
    });

    it('names a row by any of its blocks, more than once', () => {
      const sobretasa = blockOf(FILLED, 'Sobretasa ambiental');
      const sameRow = blockOf(FILLED, '$8.000');
      const marked = applySelections(
        FILLED,
        'LIQUIDACION',
        [YEAR],
        [sobretasa, sameRow, sobretasa],
      );
      expect(
        readDocxContent(marked, 'LIQUIDACION').blocks.some(
          (block) => block.text === '$8.000',
        ),
      ).toBe(false);
    });

    it('rejects a row with a marker, a block outside a table and a whole table', () => {
      expect(reject([YEAR.blockId])).toEqual({
        blockId: YEAR.blockId,
        reason: 'REMOVED_ROW_HAS_MARKER',
      });
      const withMarker = docxFromXml(
        tableXml([['{#rows}{year}{/rows}'], ['2025']]) + paragraphXml('Texto'),
      );
      expect(
        codeOf(() =>
          applySelections(withMarker, 'LIQUIDACION', [], ['body:p0']),
        ).details,
      ).toEqual({ blockId: 'body:p0', reason: 'REMOVED_ROW_HAS_MARKER' });
      expect(
        codeOf(() =>
          applySelections(withMarker, 'LIQUIDACION', [], ['body:p2']),
        ).details,
      ).toEqual({ blockId: 'body:p2', reason: 'REMOVED_ROW_OUTSIDE_TABLE' });

      const oneRow = docxFromXml(tableXml([['2025', '$1']]));
      expect(
        codeOf(() => applySelections(oneRow, 'LIQUIDACION', [], ['body:p0']))
          .details,
      ).toEqual({ blockId: 'body:p0', reason: 'REMOVED_ROW_LAST' });
      expect(
        codeOf(() => applySelections(FILLED, 'LIQUIDACION', [], ['body:p99'])),
      ).toEqual({
        code: ErrorCode.TEMPLATE_BLOCK_NOT_FOUND,
        details: { blockId: 'body:p99' },
      });
    });

    it('changes nothing when a row is refused', () => {
      const before = Buffer.from(FILLED);
      reject([YEAR.blockId]);
      expect(FILLED.equals(before)).toBe(true);
    });
  });

  describe('rejects', () => {
    const reject = (selections: Selection[], docx = DOCX) =>
      codeOf(() => applySelections(docx, 'LIQUIDACION', selections));
    const one = (overrides: Partial<Selection>): Selection => ({
      blockId: 'body:p0',
      start: 0,
      end: 3,
      field: 'cadastralCode',
      ...overrides,
    });

    it('a field that is not in the catalog of the document type', () => {
      expect(reject([one({ field: 'paymentOrderNumber' })])).toEqual({
        code: ErrorCode.TEMPLATE_FIELD_UNKNOWN,
        details: { index: 0, field: 'paymentOrderNumber' },
      });
      expect(
        codeOf(() =>
          applySelections(DOCX, 'MANDAMIENTO', [
            one({ field: 'liquidations.number' }),
          ]),
        ).code,
      ).toBe(ErrorCode.TEMPLATE_FIELD_UNKNOWN);
    });

    it('a block that does not exist or is inside a text box', () => {
      expect(reject([one({ blockId: 'body:p99' })])).toEqual({
        code: ErrorCode.TEMPLATE_BLOCK_NOT_FOUND,
        details: { index: 0, blockId: 'body:p99' },
      });
      expect(reject([one({ blockId: 'header1:p1' })]).code).toBe(
        ErrorCode.TEMPLATE_BLOCK_NOT_FOUND,
      );
    });

    it('an empty range and a range past the end of the paragraph', () => {
      expect(reject([one({ start: 3, end: 3 })]).details).toEqual({
        index: 0,
        reason: 'EMPTY',
      });
      expect(reject([one({ end: 999 })]).details).toEqual({
        index: 0,
        reason: 'OUT_OF_RANGE',
      });
    });

    it('a table field outside a table', () => {
      expect(reject([one({ field: 'rows.year' })]).details).toEqual({
        index: 0,
        reason: 'ROW_FIELD_OUTSIDE_TABLE',
      });
    });

    it('table fields in two rows or in two tables', () => {
      const year = one({ blockId: 'body:p6', end: 4, field: 'rows.year' });
      expect(
        reject([year, one({ blockId: 'body:p13', field: 'rows.capital' })])
          .details,
      ).toEqual({ index: 1, reason: 'ROWS_IN_SEVERAL_ROWS' });

      const twoTables = docxFromXml(
        tableXml([['2024']]) + tableXml([['$350.000']]),
      );
      expect(
        reject(
          [
            one({ blockId: 'body:p0', end: 4, field: 'rows.year' }),
            one({ blockId: 'body:p1', field: 'rows.capital' }),
          ],
          twoTables,
        ).details,
      ).toEqual({ index: 1, reason: 'ROWS_IN_SEVERAL_TABLES' });
    });

    it('two selections that overlap', () => {
      expect(
        reject([
          one({ start: 0, end: 5 }),
          one({ start: 4, end: 8, field: 'propertyName' }),
        ]),
      ).toEqual({
        code: ErrorCode.TEMPLATE_SELECTION_OVERLAP,
        details: { indexes: [0, 1] },
      });
    });

    it('a selection over a marker the document already has', () => {
      const docx = buildDocx(['Resolución {resolutionNumber}']);
      expect(reject([one({ start: 5, end: 15 })], docx)).toEqual({
        code: ErrorCode.TEMPLATE_SELECTION_OVERLAP,
        details: { indexes: [0] },
      });
    });

    it(`more than ${MAX_SELECTIONS} selections`, () => {
      expect(
        reject(Array.from({ length: MAX_SELECTIONS + 1 }, () => one({})))
          .details,
      ).toEqual({ reason: 'TOO_MANY' });
    });

    it('without changing the original file', () => {
      const copy = Buffer.from(DOCX);
      reject([one({ start: 0, end: 5 }), one({ start: 4, end: 8 })]);
      expect(DOCX.equals(copy)).toBe(true);
    });
  });
});

// The official template is client material and is not in git (see
// liquidation.e2e-spec.ts); this runs only where the file is present.
const PAEZ_TEMPLATE = resolve(process.cwd(), 'templates/liquidacion-paez.docx');

describe.skipIf(!existsSync(PAEZ_TEMPLATE))(
  'the official Páez liquidation template',
  () => {
    // Each marker becomes sample text, as if the lawyer uploaded the
    // document before it was marked. Loop and section tags just disappear.
    const SAMPLES: Record<string, string> = {
      resolutionNumber: 'QRESQ',
      cadastralCode: 'QCATQ',
      propertyName: 'QPROPQ',
      owners: 'QOWNQ',
      startYear: 'QSTARTQ',
      endYear: 'QENDQ',
      totalAmount: 'QTOTQ',
      capitalAmount: 'QCAPAMTQ',
      interestAmount: 'QINTAMTQ',
      'rows.year': 'QYEARQ',
      'rows.concept': 'QCONQ',
      'rows.interest': 'QINTQ',
      'rows.capital': 'QCAPQ',
    };

    function unmark(docx: Buffer): Buffer {
      const zip = new PizZip(docx);
      let xml = zip.file('word/document.xml')!.asText();
      for (const tag of ['{#owners}', '{/owners}', '{#rows}', '{/rows}']) {
        xml = xml.split(tag).join('');
      }
      for (const [field, sample] of Object.entries(SAMPLES)) {
        xml = xml.split(`{${field.replace('rows.', '')}}`).join(sample);
      }
      zip.file('word/document.xml', xml);
      return zip.generate({ type: 'nodebuffer' });
    }

    it('marked again from the unmarked copy gives the same fields as the original', () => {
      const original = readFileSync(PAEZ_TEMPLATE);
      const unmarked = unmark(original);
      const content = readDocxContent(unmarked, 'LIQUIDACION');
      expect(content.appliedMarkers).toEqual([]);

      const selections: Selection[] = content.blocks.flatMap((block) =>
        Object.entries(SAMPLES).flatMap(([field, sample]) =>
          [...block.text.matchAll(new RegExp(sample, 'g'))].map((match) => ({
            blockId: block.blockId,
            start: match.index,
            end: match.index + sample.length,
            field,
          })),
        ),
      );
      const marked = applySelections(unmarked, 'LIQUIDACION', selections);

      expect(fieldsOf(marked)).toEqual(fieldsOf(original));
      const text = render(marked, PREVIEW_DATA.LIQUIDACION);
      expect(text).toContain('RES-0001-2026');
      expect(text).toContain('a nombre de María Pérez Gómez y Juan Rodríguez');
      expect(text.match(/Impuesto predial/g)).toHaveLength(3);
    });
  },
);

// Guards the XML namespace handling of the serializer: the file must keep a
// single, well-formed declaration of the Word namespace.
it('writes parts that Word can open (namespaces and xml:space)', () => {
  const marked = applySelections(DOCX, 'LIQUIDACION', [
    { blockId: 'body:p0', start: 11, end: 14, field: 'resolutionNumber' },
  ]);
  const xml = new PizZip(marked).file('word/document.xml')!.asText();
  expect(xml.match(new RegExp(`xmlns:w="${W}"`, 'g'))).toHaveLength(1);
  expect(xml).toContain(
    '<w:t xml:space="preserve">RESOLUCIÓN {resolutionNumber} DE 2025</w:t>',
  );
  expect(xml).not.toContain('xmlns:xml');
});
