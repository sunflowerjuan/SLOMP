import PizZip from 'pizzip';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { optimizeTemplateImages } from './optimize-template-images.js';
import { docxFromXml, partXml } from './test-docx.js';

const REL =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const EMU_PER_INCH = 914_400;

// A drawing shown at width x height inches, with Word's prefixes or the
// ns3:/ns5: ones the Páez templates came with.
const drawing = (
  id: string,
  width: number,
  height: number,
  { crop = '', wp = 'wp', a = 'a' } = {},
) =>
  `<w:p><w:r><w:drawing><${wp}:inline xmlns:${wp}="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><${wp}:extent cx="${Math.round(width * EMU_PER_INCH)}" cy="${Math.round(height * EMU_PER_INCH)}"/><${a}:graphic xmlns:${a}="http://schemas.openxmlformats.org/drawingml/2006/main"><${a}:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><${a}:blip xmlns:r="${REL}" r:embed="${id}"/>${crop && `<${a}:srcRect ${crop}/>`}</pic:blipFill></pic:pic></${a}:graphicData></${a}:graphic></${wp}:inline></w:drawing></w:r></w:p>`;

const rels = (images: Record<string, string>) =>
  `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Object.entries(
    images,
  )
    .map(
      ([id, target]) =>
        `<Relationship Id="${id}" Type="${REL}/image" Target="${target}"/>`,
    )
    .join('')}</Relationships>`;

const image = (width: number, height: number, format: 'png' | 'jpeg') => {
  const base = sharp({
    create: {
      width,
      height,
      channels: format === 'png' ? 4 : 3,
      background: { r: 200, g: 30, b: 30, alpha: 0.5 },
    },
  });
  return (format === 'png' ? base.png() : base.jpeg()).toBuffer();
};

// Header logo of the Páez template: 3080x1600 px, cropped to 84 % x 65 % and
// shown at 1.24 x 0.5 in.
async function template(): Promise<Buffer> {
  const zip = new PizZip(
    docxFromXml(drawing('rId1', 2, 1) + drawing('rId2', 1, 1), {
      'word/_rels/document.xml.rels': rels({
        rId1: 'media/photo.jpeg',
        rId2: 'media/icon.png',
      }),
      'word/header1.xml': partXml(
        'hdr',
        drawing('rId1', 1.2396, 0.5, {
          crop: 'l="8978" t="16449" r="7378" b="18524"',
          wp: 'ns3',
          a: 'ns5',
        }),
      ),
      'word/_rels/header1.xml.rels': rels({ rId1: 'media/logo.png' }),
    }),
  );
  zip.file('word/media/logo.png', await image(3080, 1600, 'png'));
  zip.file('word/media/photo.jpeg', await image(2000, 1000, 'jpeg'));
  zip.file('word/media/icon.png', await image(150, 150, 'png'));
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

const size = async (docx: Buffer, media: string) => {
  const { width, height } = await sharp(
    new PizZip(docx).file(media)!.asNodeBuffer(),
  ).metadata();
  return [width, height];
};

describe('optimizeTemplateImages', () => {
  it('resamples images to 150 ppi of the size they are shown at', async () => {
    const original = await template();
    const optimized = await optimizeTemplateImages(original);

    // The visible 84 % x 65 % comes to 186 x 75 px, what Word leaves.
    expect(await size(optimized, 'word/media/logo.png')).toEqual([223, 116]);
    expect(await size(optimized, 'word/media/photo.jpeg')).toEqual([300, 150]);
    // Already at 150 ppi: untouched.
    const icon = (docx: Buffer) =>
      new PizZip(docx).file('word/media/icon.png')!.asNodeBuffer();
    expect(icon(optimized)).toEqual(icon(original));
    const { channels } = await sharp(
      new PizZip(optimized).file('word/media/logo.png')!.asNodeBuffer(),
    ).metadata();
    expect(channels).toBe(4);
    expect(new PizZip(optimized).file('word/document.xml')!.asText()).toBe(
      new PizZip(original).file('word/document.xml')!.asText(),
    );
    expect(optimized.length).toBeLessThan(original.length);
  });

  it('gives the same bytes for the same upload', async () => {
    const original = await template();
    expect(await optimizeTemplateImages(original)).toEqual(
      await optimizeTemplateImages(original),
    );
  });

  it('returns the file as it came when there is nothing to do', async () => {
    const plain = docxFromXml('<w:p><w:r><w:t>{name}</w:t></w:r></w:p>');
    expect(await optimizeTemplateImages(plain)).toBe(plain);

    const zip = new PizZip(await template());
    zip.file('word/media/logo.png', Buffer.from('not an image'));
    zip.remove('word/media/photo.jpeg');
    const broken = zip.generate({ type: 'nodebuffer' });
    expect(await optimizeTemplateImages(broken)).toBe(broken);
  });
});
