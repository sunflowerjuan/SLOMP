import { PDFDocument } from 'pdf-lib';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { mergeDocuments, splitPdf } from '../src/merge.ts';
import { minimalDocx } from '../src/minimal-docx.ts';
import { mergedPdf, sectionTemplate } from './fakes.ts';

const data = ['2026-0001', '2026-0002', '2026-0003'].map(
  (resolutionNumber) => ({ resolutionNumber }),
);

describe('mergeDocuments', () => {
  it('makes each document a section that counts its own pages', () => {
    const zip = new PizZip(mergeDocuments(sectionTemplate(), data)!);
    const document = zip.file('word/document.xml')!.asText();

    for (const { resolutionNumber } of data) {
      expect(document).toContain(resolutionNumber);
    }
    expect(document).not.toContain('{');
    const sections = document.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/g)!;
    expect(sections).toHaveLength(3);
    sections.forEach((section, i) => {
      const k = i + 1;
      expect(section).toContain('<w:pgNumType w:start="1"/>');
      expect(section).toContain(
        `<w:headerReference w:type="default" r:id="rIdSlompheader${k}"/>`,
      );
      // The footer doesn't count pages: declared once, inherited after.
      expect(section.includes('<w:footerReference')).toBe(k === 1);
      expect(zip.file(`word/slompheader${k}.xml`)!.asText()).toContain(
        `PAGEREF SlompEnd0000${k}`,
      );
      expect(zip.file(`word/_rels/slompheader${k}.xml.rels`)).not.toBeNull();
      expect(document).toContain(`w:name="SlompDoc0000${k}"`);
      expect(document).toContain(`w:name="SlompEnd0000${k}"`);
    });
    const ids = [...document.matchAll(/w:bookmarkStart w:id="(\d+)"/g)].map(
      ([, id]) => id,
    );
    expect(new Set(ids).size).toBe(6);
    expect(zip.file('word/_rels/document.xml.rels')!.asText()).toContain(
      'Target="slompheader3.xml"',
    );
    expect(zip.file('[Content_Types].xml')!.asText()).toContain(
      'PartName="/word/slompheader3.xml"',
    );
  });

  it('ignores the {GUID} attributes Word writes in a header image', () => {
    const header =
      '<w:p><w:r><w:drawing><a:ext uri="{28A0092B-C50C-407E-A947-70E740481C1C}"/></w:drawing></w:r><w:fldSimple w:instr=" NUMPAGES "/></w:p>';
    expect(mergeDocuments(sectionTemplate({ header }), data)).not.toBe(null);
  });

  it('leaves layouts it does not reproduce to the per-document path', () => {
    expect(mergeDocuments(minimalDocx(['{resolutionNumber}']), data)).toBe(
      null,
    );
    expect(
      mergeDocuments(sectionTemplate({ sectExtra: '<w:titlePg/>' }), data),
    ).toBe(null);
    expect(
      mergeDocuments(
        sectionTemplate({
          sectExtra: '<w:pgNumType w:start="3"/>',
        }),
        data,
      ),
    ).toBe(null);
    expect(
      mergeDocuments(
        sectionTemplate({
          header: '<w:p><w:r><w:t>{resolutionNumber}</w:t></w:r></w:p>',
        }),
        data,
      ),
    ).toBe(null);
  });
});

describe('splitPdf', () => {
  it.each(['Dests', 'Names'] as const)(
    'cuts the PDF where each document starts (%s)',
    async (where) => {
      const pdfs = await splitPdf(await mergedPdf([2, 1, 3], where), 3);
      const pages = await Promise.all(
        pdfs!.map(async (pdf) => (await PDFDocument.load(pdf)).getPageCount()),
      );
      expect(pages).toEqual([2, 1, 3]);
    },
  );

  it('refuses a PDF that does not hold the expected documents', async () => {
    expect(await splitPdf(await mergedPdf([2, 1]), 3)).toBe(null);
    expect(await splitPdf(Buffer.from('%PDF-1.7 fake %%EOF'), 1)).toBe(null);
  });
});
