import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import {
  applySelections,
  readDocxContent,
  type Selection,
} from './guided-marking.js';
import { PREVIEW_DATA } from './template-preview-data.js';
import { docxFromXml, partXml } from './test-docx.js';
import { validateTemplateFields } from './validate-template-fields.js';

// SL-161: documents that look like what Word saves after many edits, built in
// memory (nothing is written to disk and no real data is used). Word keeps
// revision ids on every run, splits a sentence where the font or the language
// changes, and adds spelling and bookmark anchors between runs.

type PartType = 'LIQUIDACION' | 'MANDAMIENTO';

const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const TIMES = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>';
const ARIAL = '<w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="22"/>';
const BOLD = '<w:b/><w:bCs/>';

let rsid = 0;
const nextRsid = () => (0x00a10000 + rsid++).toString(16).padStart(8, '0');

// [text, run properties] -> one w:r with a revision id and the language Word adds.
function run(text: string, properties = TIMES): string {
  return `<w:r w:rsidR="${nextRsid()}"><w:rPr>${properties}<w:lang w:val="es-CO"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
}

function para(...inner: (string | [string, string?])[]): string {
  const body = inner
    .map((part) => {
      if (typeof part !== 'string') return run(part[0], part[1] ?? TIMES);
      return part.startsWith('<') ? part : run(part);
    })
    .join('');
  return `<w:p w:rsidR="${nextRsid()}" w:rsidRDefault="00A10000"><w:pPr><w:jc w:val="both"/></w:pPr>${body}</w:p>`;
}

const spellErr = (inner: string) =>
  `<w:proofErr w:type="spellStart"/>${inner}<w:proofErr w:type="spellEnd"/>`;
const bookmark = (id: number, inner: string) =>
  `<w:bookmarkStart w:id="${id}" w:name="_Toc${id}"/>${inner}<w:bookmarkEnd w:id="${id}"/>`;
const pageBreakMark = '<w:r><w:lastRenderedPageBreak/></w:r>';
const tab = '<w:r><w:tab/></w:r>';

function cell(width: number, content: string): string {
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/></w:tcPr>${content}</w:tc>`;
}

function table(rows: string[][]): string {
  const widths = [1200, 3600, 2000, 2000];
  return `<w:tbl><w:tblPr><w:tblW w:w="8800" w:type="dxa"/></w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows
    .map(
      (cells) =>
        `<w:tr w:rsidR="00A10001">${cells.map((c, i) => cell(widths[i]!, c)).join('')}</w:tr>`,
    )
    .join('')}</w:tbl>`;
}

const FILES = {
  'word/header1.xml': partXml(
    'hdr',
    para(['ALCALDÍA MUNICIPAL DE EJEMPLO', `${TIMES}${BOLD}`]),
  ),
  'word/footer1.xml': partXml(
    'ftr',
    para(['Carrera 1 # 2-3, Ejemplo — ', ARIAL], ['tel. 000 0000', ARIAL]),
  ),
};

// Fictitious values the lawyer's document carries before it is marked. They
// are not in the preview data, so any left in a rendered file is a miss.
const LIQUIDATION_SAMPLES: [string, string][] = [
  ['LOIP-9999', 'resolutionNumber'],
  ['11-22-3333-4444-555', 'cadastralCode'],
  ['Casa Falsa', 'propertyName'],
  ['Persona Ficticia Uno', 'owners'],
  ['1998', 'startYear'],
  ['2001', 'endYear'],
  ['$9.999.999', 'totalAmount'],
  ['$7.777.777', 'capitalAmount'],
  ['$2.223.456', 'interestAmount'],
  ['1999', 'rows.year'],
  ['Predial Falso', 'rows.concept'],
  ['$33.333', 'rows.interest'],
  ['$44.444', 'rows.capital'],
];

const PAYMENT_ORDER_SAMPLES: [string, string][] = [
  ['MND-9999', 'paymentOrderNumber'],
  ['3 de marzo de 1999', 'issueDate'],
  ['11-22-3333-4444-555', 'cadastralCode'],
  ['Casa Falsa', 'propertyName'],
  ['Persona Ficticia Uno', 'owners'],
  ['1998', 'startYear'],
  ['2001', 'endYear'],
  ['$7.777.777', 'capitalAmount'],
  ['LIQ-AAA, LIQ-BBB y LIQ-CCC', 'liquidations'],
];

// Liquidation saved by Word: font changes in mid-sentence, spelling and
// bookmark anchors, text pasted from a web page (hyperlink, other font) and
// from another document, and tracked changes.
function liquidationUnmarked(): Buffer {
  const body = [
    para(
      ['RESOLUCIÓN N° ', `${TIMES}${BOLD}`],
      ['LOIP-', `${TIMES}${BOLD}`],
      ['9999', ARIAL],
    ),
    para(
      'Predio con cédula catastral ',
      spellErr(run('11-22-3333-', TIMES)),
      bookmark(1, run('4444-555', ARIAL)),
      ' denominado ',
      spellErr(run('Casa ')),
      run('Falsa', `${TIMES}<w:i/>`),
      ', de propiedad de ',
      run('Persona Ficticia ', ARIAL),
      run('Uno'),
      '.',
    ),
    para(
      'Vigencias ',
      ['1998', ARIAL],
      ' a ',
      pageBreakMark,
      ['2001', ARIAL],
      tab,
      ', total ',
      run('$9.999', TIMES),
      run('.999', ARIAL),
      ', capital $7.777.777 e intereses ',
      ['$2.223.456', `${TIMES}${BOLD}`],
      '.',
    ),
    table([
      [
        para(['Año', BOLD]),
        para(['Concepto', BOLD]),
        para(['Interés', BOLD]),
        para(['Capital', BOLD]),
      ],
      [
        para('1999'),
        para(run('Predial '), run('Falso', ARIAL)),
        para('$33.333'),
        para('$44.444'),
      ],
    ]),
    // Pasted from a web page: other font, inside a hyperlink.
    para(
      'Consulte el predio ',
      `<w:hyperlink xmlns:r="${R}" r:id="rId7" w:history="1">${run('Casa Falsa', ARIAL)}</w:hyperlink>`,
      ' en el portal.',
    ),
    // Tracked changes: the old name was deleted, the new one inserted.
    para(
      'Antes ',
      `<w:del w:id="21" w:author="Revisor" w:date="2026-01-01T00:00:00Z"><w:r><w:delText>Casa Vieja</w:delText></w:r></w:del>`,
      `<w:ins w:id="22" w:author="Revisor" w:date="2026-01-01T00:00:00Z">${run('Casa Falsa')}</w:ins>`,
      ' hoy.',
    ),
    '<w:sectPr><w:headerReference w:type="default" r:id="rId8" xmlns:r="' +
      R +
      '"/></w:sectPr>',
  ].join('');
  return docxFromXml(body, FILES);
}

// Same document with the markers typed by hand: Word breaks them where the
// spell checker or the language changes, so each one crosses several runs.
function liquidationHandMarked(): Buffer {
  const body = [
    para('RESOLUCIÓN N° ', run('{resolu'), run('tionNum'), run('ber}')),
    para(
      'Predio con cédula catastral ',
      spellErr(run('{cadas')),
      run('tralCode}'),
      ' denominado ',
      run('{propertyN'),
      run('ame}'),
      ' de ',
      run('{#owners}'),
      run('{own'),
      run('ers}{/owners}'),
      '.',
    ),
    para(
      'Vigencias {startYear} a {endYear}, total ',
      spellErr(run('{totalAm')),
      run('ount}'),
      ', capital {capitalAmount} e intereses {interestAmount}.',
    ),
    table([
      [para('Año'), para('Concepto'), para('Interés'), para('Capital')],
      [
        para(run('{#ro'), run('ws}{ye'), run('ar}')),
        para('{concept}'),
        para('{interest}'),
        para(run('{cap'), run('ital}{/rows}')),
      ],
    ]),
  ].join('');
  return docxFromXml(body, FILES);
}

function paymentOrderUnmarked(): Buffer {
  const body = [
    para(['MANDAMIENTO DE PAGO N° ', BOLD], ['MND-', BOLD], ['9999', ARIAL]),
    para('Expedido el ', run('3 de marzo '), spellErr(run('de 1999', ARIAL))),
    para(
      'Respaldado por las liquidaciones ',
      run('LIQ-AAA, '),
      run('LIQ-BBB', ARIAL),
      ' y LIQ-CCC',
      '.',
    ),
    para(
      'Predio ',
      run('11-22-3333-'),
      run('4444-555', ARIAL),
      ' (',
      run('Casa Falsa'),
      '), a nombre de Persona Ficticia Uno, vigencias 1998 a 2001, capital ',
      run('$7.777.777', `${TIMES}${BOLD}`),
      '.',
    ),
  ].join('');
  return docxFromXml(body, FILES);
}

function everyMatch(
  docx: Buffer,
  type: PartType,
  samples: [string, string][],
): Selection[] {
  const { blocks } = readDocxContent(docx, type);
  return blocks.flatMap((block) =>
    samples.flatMap(([sample, field]) => {
      const found: Selection[] = [];
      for (
        let at = block.text.indexOf(sample);
        at >= 0;
        at = block.text.indexOf(sample, at + sample.length)
      ) {
        found.push({
          blockId: block.blockId,
          start: at,
          end: at + sample.length,
          field,
        });
      }
      return found;
    }),
  );
}

function render(docx: Buffer, data: object): string {
  const document = new Docxtemplater(new PizZip(docx), { paragraphLoop: true });
  document.render(data);
  return document.getFullText();
}

function fieldsIn(docx: Buffer, type: PartType): string[] {
  return readDocxContent(docx, type).appliedMarkers.map((m) => m.field);
}

describe('guided marking with documents saved the way Word saves them', () => {
  describe('liquidation without markers', () => {
    const docx = liquidationUnmarked();
    const content = readDocxContent(docx, 'LIQUIDACION');

    it('has no markers and every sample is readable although Word split it', () => {
      expect(content.appliedMarkers).toEqual([]);
      const text = content.blocks.map((b) => b.text).join('\n');
      for (const [sample] of LIQUIDATION_SAMPLES) {
        expect(text, sample).toContain(sample);
      }
      // Deleted text of a tracked change is not offered to be marked.
      expect(text).not.toContain('Casa Vieja');
    });

    it('is marked in full and renders with the preview data, leaving the rest as it was', () => {
      const selections = everyMatch(docx, 'LIQUIDACION', LIQUIDATION_SAMPLES);
      const marked = applySelections(docx, 'LIQUIDACION', selections);

      const missing = validateTemplateFields(
        'LIQUIDACION',
        fieldsIn(marked, 'LIQUIDACION'),
      );
      expect(missing).toEqual({ missing: [], unknown: [] });

      const text = render(marked, PREVIEW_DATA.LIQUIDACION);
      expect(text).not.toMatch(/[{}]/);
      for (const [sample] of LIQUIDATION_SAMPLES) {
        expect(text, sample).not.toContain(sample);
      }
      expect(text).toContain('RESOLUCIÓN N° RES-0001-2026');
      expect(text).toContain('Predio con cédula catastral 00-01-0001-0001-000');
      expect(text).toContain('Lote El Ejemplo');
      expect(text).toContain('María Pérez Gómez y Juan Rodríguez');
      expect(text).toContain('total $1.250.000');
      // Text of the document that is not a field stays as it is.
      for (const literal of [
        'Predio con cédula catastral ',
        ' denominado ',
        'Consulte el predio ',
        ' en el portal.',
        'Antes ',
        ' hoy.',
        'AñoConceptoInterésCapital',
      ]) {
        expect(text, literal).toContain(literal);
      }
      // One example row repeats once per period.
      expect(text.match(/Impuesto predial/g)).toHaveLength(3);
    });

    it('keeps the formatting of the first fragment of each marked field', () => {
      const selections = everyMatch(docx, 'LIQUIDACION', LIQUIDATION_SAMPLES);
      const marked = applySelections(docx, 'LIQUIDACION', selections);
      const title = readDocxContent(marked, 'LIQUIDACION').blocks.find((b) =>
        b.text.startsWith('RESOLUCIÓN'),
      )!;
      expect(title.text).toBe('RESOLUCIÓN N° {resolutionNumber}');
      expect(title.fragments[0]).toMatchObject({ bold: true });
    });

    it('keeps tracked changes, anchors and the hyperlink in the marked file', () => {
      const selections = everyMatch(docx, 'LIQUIDACION', LIQUIDATION_SAMPLES);
      const marked = applySelections(docx, 'LIQUIDACION', selections);
      const xml = new PizZip(marked).file('word/document.xml')!.asText();
      expect(xml).toContain('<w:delText>Casa Vieja</w:delText>');
      expect(xml).toContain('<w:hyperlink');
      expect(xml).toContain('w:bookmarkStart');
      expect(xml).toContain('<w:tab/>');
    });
  });

  describe('liquidation with markers typed by hand', () => {
    const docx = liquidationHandMarked();

    it('recognizes every marker although Word split it across runs', () => {
      const fields = fieldsIn(docx, 'LIQUIDACION');
      for (const field of [
        'resolutionNumber',
        'cadastralCode',
        'propertyName',
        'owners',
        'startYear',
        'endYear',
        'totalAmount',
        'capitalAmount',
        'interestAmount',
        'rows',
        'rows.year',
        'rows.concept',
        'rows.interest',
        'rows.capital',
      ]) {
        expect(fields, field).toContain(field);
      }
      expect(validateTemplateFields('LIQUIDACION', fields).missing).toEqual([]);
    });

    it('renders with the preview data without leaving a brace', () => {
      const text = render(docx, PREVIEW_DATA.LIQUIDACION);
      expect(text).not.toMatch(/[{}]/);
      expect(text).toContain('RES-0001-2026');
      expect(text).toContain('María Pérez Gómez y Juan Rodríguez');
      expect(text.match(/Impuesto predial/g)).toHaveLength(3);
    });
  });

  describe('payment order without markers', () => {
    const docx = paymentOrderUnmarked();

    it('is marked in full, with the inline list of liquidations, and renders', () => {
      const content = readDocxContent(docx, 'MANDAMIENTO');
      expect(content.appliedMarkers).toEqual([]);

      const selections = everyMatch(docx, 'MANDAMIENTO', PAYMENT_ORDER_SAMPLES);
      const marked = applySelections(docx, 'MANDAMIENTO', selections);
      expect(
        validateTemplateFields('MANDAMIENTO', fieldsIn(marked, 'MANDAMIENTO')),
      ).toEqual({ missing: [], unknown: [] });

      const text = render(marked, PREVIEW_DATA.MANDAMIENTO);
      expect(text).not.toMatch(/[{}]/);
      for (const [sample] of PAYMENT_ORDER_SAMPLES) {
        expect(text, sample).not.toContain(sample);
      }
      expect(text).toContain('MANDAMIENTO DE PAGO N° MND-0001-2026');
      expect(text).toContain(
        'Respaldado por las liquidaciones LIQ-0001-2026, LIQ-0002-2026 y LIQ-0003-2026.',
      );
      expect(text).toContain('Expedido el 15 de enero de 2026');
    });
  });
});
