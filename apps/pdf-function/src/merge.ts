import Docxtemplater from 'docxtemplater';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFObject,
} from 'pdf-lib';
import PizZip from 'pizzip';

// A bulk batch as ONE .docx: LibreOffice pays its per-document costs once per
// batch instead of once per document (1000 liquidations on 1 vCPU: 0.43 s a
// document converting 10 per soffice call, 0.29 s merging 40). Each document
// is its own section, so page numbers restart, and "Página X de Y" keeps
// working through a per-document header whose NUMPAGES becomes a PAGEREF to a
// bookmark at the end of that document (LibreOffice has no SECTIONPAGES).
// Another bookmark at its start becomes a PDF named destination (see the
// profile in soffice.ts) and tells where to split the PDF back.

const LOOP = 'slompDocs';
const BREAK = 'slompBreak';
const START = 'SlompDoc';
const END = 'SlompEnd';
const BOOKMARK_ID = 900_000;
const TYPES = {
  header:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml',
  footer:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml',
};

const pad = (n: number) => String(n).padStart(5, '0');
const bookmark = (name: string, id: number) =>
  `<w:bookmarkStart w:id="${id}" w:name="${name}"/><w:bookmarkEnd w:id="${id}"/>`;
const paragraph = (text: string) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;

interface PartRef {
  kind: 'header' | 'footer';
  element: string;
  id: string;
  target: string;
  relType: string;
}

/**
 * The batch merged into one .docx, or null when the template has a layout
 * this doesn't reproduce (the caller converts the documents one by one).
 * Throws what docxtemplater throws when the data doesn't fit.
 */
export function mergeDocuments(
  template: Buffer,
  data: Record<string, unknown>[],
): Buffer | null {
  const zip = new PizZip(template);
  const xml = zip.file('word/document.xml')?.asText();
  if (!xml) return null;
  const bodyStart = xml.indexOf('<w:body>') + '<w:body>'.length;
  const sectStart = xml.lastIndexOf('<w:sectPr');
  const bodyEnd = xml.lastIndexOf('</w:body>');
  // ponytail: single-section templates without a different first page or
  // even/odd headers (the Páez ones and anything saved plainly from Word);
  // other layouts keep the per-document path.
  if (bodyStart < 8 || sectStart < bodyStart || bodyEnd < sectStart)
    return null;
  const inner = xml.slice(bodyStart, sectStart);
  const sect = xml.slice(sectStart, bodyEnd);
  if (inner.includes('<w:sectPr') || sect.includes('<w:titlePg')) return null;
  if (zip.file('word/settings.xml')?.asText().includes('<w:evenAndOddHeaders'))
    return null;
  if (inner.includes('NUMPAGES')) return null;
  const start = sect.match(/<w:pgNumType[^>]*w:start="(\d+)"/)?.[1];
  if (start && start !== '1') return null;

  const rels = zip.file('word/_rels/document.xml.rels')?.asText() ?? '';
  const parts = [...sect.matchAll(/<w:(header|footer)Reference [^>]*\/>/g)].map(
    ([element, kind]): PartRef => {
      const id = element.match(/:id="([^"]+)"/)![1]!;
      const rel = rels.match(new RegExp(`<Relationship [^>]*Id="${id}"[^>]*>`));
      return {
        kind: kind as PartRef['kind'],
        element,
        id,
        target: rel?.[0].match(/Target="([^"]+)"/)?.[1] ?? '',
        relType: rel?.[0].match(/Type="([^"]+)"/)?.[1] ?? '',
      };
    },
  );
  const partXml = parts.map((part) =>
    part.target ? zip.file(`word/${part.target}`)?.asText() : undefined,
  );
  // Markers in a header would be filled outside the per-document loop. Only
  // the text counts: Word writes "{GUID}" attributes in image extensions.
  const markers = (xml: string) =>
    [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].some(([, text]) =>
      text!.includes('{'),
    );
  if (partXml.some((xml) => xml === undefined || markers(xml))) return null;
  // Parts that count pages get a copy per document; the rest are declared in
  // the first section only and the others inherit them.
  const perDocument = parts.filter((_, i) => partXml[i]!.includes('NUMPAGES'));

  // Every section restarts at page 1, like each document on its own.
  const restart = sect.includes('<w:pgNumType')
    ? sect.replace(/<w:pgNumType(?![^>]*w:start=)/, '<w:pgNumType w:start="1"')
    : sect.replace(
        /<w:cols\b|<\/w:sectPr>/,
        (next) => `<w:pgNumType w:start="1"/>${next}`,
      );
  const bare = restart.replace(/<w:(header|footer)Reference [^>]*\/>/g, '');

  // A minimal paragraph carrying the section break ends each previous
  // document. Bookmarks go on the first and last paragraph of the body.
  const brk = `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr>${bare}</w:pPr></w:p>`;
  let marked = inner.replace(
    /<w:p(?:\s[^>]*[^/])?>(?:<w:pPr>[\s\S]*?<\/w:pPr>)?/,
    (open) => open + bookmark(START, BOOKMARK_ID),
  );
  const last = marked.lastIndexOf('</w:p>');
  if (last === -1) return null;
  marked =
    marked.slice(0, last) + bookmark(END, BOOKMARK_ID) + marked.slice(last);
  zip.file(
    'word/document.xml',
    xml.slice(0, bodyStart) +
      paragraph(`{#${LOOP}}`) +
      paragraph(`{#${BREAK}}`) +
      brk +
      paragraph(`{/${BREAK}}`) +
      marked +
      paragraph(`{/${LOOP}}`) +
      bare +
      xml.slice(bodyEnd),
  );

  const document = new Docxtemplater(zip, { paragraphLoop: true });
  document.render({
    [LOOP]: data.map((values, i) => ({ ...values, [BREAK]: i > 0 })),
  });
  const out = document.getZip();

  let rendered = out.file('word/document.xml')!.asText();
  for (const name of [START, END]) {
    let n = 0;
    rendered = rendered.replaceAll(bookmark(name, BOOKMARK_ID), () => {
      n++;
      const offset = name === START ? 0 : data.length;
      return bookmark(`${name}${pad(n)}`, BOOKMARK_ID + offset + n);
    });
  }

  let documentRels = out.file('word/_rels/document.xml.rels')!.asText();
  let types = out.file('[Content_Types].xml')!.asText();
  let section = 0;
  rendered = rendered.replace(/<w:sectPr(?:\s[^>]*)?>/g, (open) => {
    section++;
    const refs = parts.map((part) => {
      if (!perDocument.includes(part)) return section === 1 ? part.element : '';
      const copy = `slomp${part.kind}${section}.xml`;
      const id = `rIdSlomp${part.kind}${section}`;
      out.file(
        `word/${copy}`,
        out
          .file(`word/${part.target}`)!
          .asText()
          .replaceAll('NUMPAGES', `PAGEREF ${END}${pad(section)}`),
      );
      const partRels = out.file(`word/_rels/${part.target}.rels`)?.asText();
      if (partRels) out.file(`word/_rels/${copy}.rels`, partRels);
      documentRels = documentRels.replace(
        '</Relationships>',
        `<Relationship Id="${id}" Type="${part.relType}" Target="${copy}"/></Relationships>`,
      );
      types = types.replace(
        '</Types>',
        `<Override PartName="/word/${copy}" ContentType="${TYPES[part.kind]}"/></Types>`,
      );
      return part.element.replace(`"${part.id}"`, `"${id}"`);
    });
    return open + refs.join('');
  });
  out.file('word/document.xml', rendered);
  out.file('word/_rels/document.xml.rels', documentRels);
  out.file('[Content_Types].xml', types);
  return out.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// Page index where each document starts, from the named destinations.
function startPages(pdf: PDFDocument): number[] {
  const pageIndex = new Map(
    pdf.getPages().map((page, i) => [page.ref.toString(), i]),
  );
  const starts = new Map<string, number>();
  const add = (name: string, value: PDFObject | undefined) => {
    let dest = pdf.context.lookup(value);
    if (dest instanceof PDFDict) dest = dest.lookup(PDFName.of('D'));
    const page = dest instanceof PDFArray ? dest.get(0) : undefined;
    const index = page && pageIndex.get(page.toString());
    if (name.startsWith(START) && index !== undefined) starts.set(name, index);
  };
  const dests = pdf.catalog.lookup(PDFName.of('Dests'));
  if (dests instanceof PDFDict) {
    for (const [key, value] of dests.entries()) add(key.decodeText(), value);
  }
  const walk = (node: PDFDict) => {
    const names = node.lookup(PDFName.of('Names'));
    if (names instanceof PDFArray) {
      for (let i = 0; i + 1 < names.size(); i += 2) {
        const key = names.lookup(i) as { decodeText?: () => string };
        if (key.decodeText) add(key.decodeText(), names.get(i + 1));
      }
    }
    const kids = node.lookup(PDFName.of('Kids'));
    if (kids instanceof PDFArray) {
      for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i) as PDFDict);
    }
  };
  const tree = pdf.catalog.lookup(PDFName.of('Names'));
  const destTree =
    tree instanceof PDFDict ? tree.lookup(PDFName.of('Dests')) : undefined;
  if (destTree instanceof PDFDict) walk(destTree);
  return [...starts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, i]) => i);
}

/** One PDF per document, or null when the merged PDF can't be split safely. */
export async function splitPdf(
  merged: Buffer,
  count: number,
): Promise<Buffer[] | null> {
  try {
    const source = await PDFDocument.load(merged);
    const starts = startPages(source);
    if (
      starts.length !== count ||
      starts[0] !== 0 ||
      starts.some((page, i) => i > 0 && page <= starts[i - 1]!)
    ) {
      return null;
    }
    const total = source.getPageCount();
    return await Promise.all(
      starts.map(async (first, i) => {
        const end = starts[i + 1] ?? total;
        const pdf = await PDFDocument.create();
        const pages = await pdf.copyPages(
          source,
          Array.from({ length: end - first }, (_, k) => first + k),
        );
        for (const page of pages) pdf.addPage(page);
        return Buffer.from(await pdf.save());
      }),
    );
  } catch {
    // pdf-lib reads lazily: a broken PDF can load and fail on its pages.
    return null;
  }
}
