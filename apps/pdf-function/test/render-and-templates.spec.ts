import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { renderDocx } from '../src/render.ts';
import { minimalDocx } from '../src/minimal-docx.ts';
import { createTemplateCache } from '../src/templates.ts';
import { FakeBlobs, templateFixture } from './fakes.ts';

const documentText = (docx: Buffer) =>
  new PizZip(docx)
    .file('word/document.xml')!
    .asText()
    .replace(/<[^>]+>/g, '');

describe('renderDocx', () => {
  it('fills the placeholders with the data as-is', () => {
    const { template } = templateFixture();
    const docx = renderDocx(template, {
      resolutionNumber: '2026-0042',
      rows: [{ year: '2022', capital: '$ 50.000' }],
    });
    expect(documentText(docx)).toContain('2026-0042');
    expect(documentText(docx)).toContain('2022 $ 50.000');
  });

  it('flags a corrupt template and a template with broken placeholders as invalid', () => {
    const invalidTemplate = expect.objectContaining({
      code: 'PDF_TEMPLATE_INVALID',
    });
    expect(() => renderDocx(Buffer.from('not a zip'), {})).toThrow(
      invalidTemplate,
    );
    expect(() => renderDocx(minimalDocx(['{unclosed']), {})).toThrow(
      invalidTemplate,
    );
  });
});

describe('createTemplateCache', () => {
  it('downloads each template version once', async () => {
    const { template, sha256 } = templateFixture();
    const blobs = new FakeBlobs();
    blobs.files.set('templates/paez/liquidacion/1.docx', template);
    const getTemplate = createTemplateCache(blobs);
    const ref = { blob: 'templates/paez/liquidacion/1.docx', sha256 };
    expect(await getTemplate(ref)).toBe(template);
    expect(await getTemplate(ref)).toBe(template);
    expect(blobs.downloads).toBe(1);
  });

  it('refuses a missing template or one whose hash does not match', async () => {
    const { template } = templateFixture();
    const blobs = new FakeBlobs();
    blobs.files.set('templates/paez/liquidacion/1.docx', template);
    const getTemplate = createTemplateCache(blobs);
    const unavailable = expect.objectContaining({
      code: 'PDF_TEMPLATE_UNAVAILABLE',
    });
    await expect(
      getTemplate({
        blob: 'templates/paez/liquidacion/1.docx',
        sha256: 'b'.repeat(64),
      }),
    ).rejects.toThrow(unavailable);
    await expect(
      getTemplate({
        blob: 'templates/otro/liquidacion/1.docx',
        sha256: 'b'.repeat(64),
      }),
    ).rejects.toThrow(unavailable);
  });
});
