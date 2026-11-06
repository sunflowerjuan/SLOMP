import { posix } from 'node:path';
import PizZip from 'pizzip';
import sharp from 'sharp';

// Images resampled to 150 ppi at the size they are shown, what Word's
// "Compress pictures > 150 ppi" does. The Páez header logo came at
// 3080x1600 px for a 3 cm slot, and LibreOffice paid for those 5 megapixels
// in every PDF: at 150 ppi a bulk PDF took 0.43 s instead of 1.78 s, and the
// template went from 318 KB to 70 KB.
const TARGET_PPI = 150;
const EMU_PER_INCH = 914_400;
// Images already close to the target are left byte-identical.
const SLACK = 1.25;

// Share of the image a crop (a:srcRect, in 1/1000 %) leaves on one axis.
function visible(srcRect: string | undefined, from: string, to: string) {
  const cut = (side: string) =>
    Number(new RegExp(`\\b${side}="(-?\\d+)"`).exec(srcRect ?? '')?.[1] ?? 0);
  return Math.min(1, Math.max(0.01, 1 - (cut(from) + cut(to)) / 100_000));
}

// Largest size (EMU) each media file would be drawn at uncropped, across the
// body, headers and footers: a cropped image keeps 150 ppi on what shows.
// Element prefixes vary between writers (w:/wp:/a: or ns3:/ns5:...). Images in
// legacy VML shapes are not looked at.
function shownSizes(zip: PizZip): Map<string, { cx: number; cy: number }> {
  const sizes = new Map<string, { cx: number; cy: number }>();
  for (const name of Object.keys(zip.files)) {
    const part = /^word\/([^/]+\.xml)$/.exec(name)?.[1];
    const rels = part && zip.file(`word/_rels/${part}.rels`)?.asText();
    if (!rels) continue;
    const targets = new Map(
      [...rels.matchAll(/<Relationship [^>]*>/g)]
        .filter(([rel]) => /Type="[^"]*\/image"/.test(rel))
        .map(([rel]) => [
          /Id="([^"]+)"/.exec(rel)?.[1],
          /Target="([^"]+)"/.exec(rel)?.[1],
        ]),
    );
    const xml = zip.file(name)!.asText();
    for (const [drawing] of xml.matchAll(
      /<(\w+):drawing>[\s\S]*?<\/\1:drawing>/g,
    )) {
      const extent = /<\w+:extent cx="(\d+)" cy="(\d+)"/.exec(drawing);
      const target = targets.get(/:embed="([^"]+)"/.exec(drawing)?.[1]);
      if (!extent || !target) continue;
      const crop = /<\w+:srcRect\b([^>]*)>/.exec(drawing)?.[1];
      const media = posix.join('word', target);
      const seen = sizes.get(media) ?? { cx: 0, cy: 0 };
      sizes.set(media, {
        cx: Math.max(seen.cx, Number(extent[1]) / visible(crop, 'l', 'r')),
        cy: Math.max(seen.cy, Number(extent[2]) / visible(crop, 't', 'b')),
      });
    }
  }
  return sizes;
}

/**
 * The template with its PNG and JPEG images resampled to 150 ppi. File names
 * and dates are kept, so the same upload always gives the same bytes (and
 * sha256). Anything it can't read is left as it came.
 */
export async function optimizeTemplateImages(docx: Buffer): Promise<Buffer> {
  let zip: PizZip;
  try {
    zip = new PizZip(docx);
  } catch {
    return docx;
  }
  let changed = false;
  for (const [media, { cx, cy }] of shownSizes(zip)) {
    const file = zip.file(media);
    if (!file) continue;
    try {
      const input = file.asNodeBuffer();
      const meta = await sharp(input).metadata();
      if (meta.format !== 'png' && meta.format !== 'jpeg') continue;
      const turned = (meta.orientation ?? 1) >= 5;
      const width = Math.ceil((cx / EMU_PER_INCH) * TARGET_PPI);
      const height = Math.ceil((cy / EMU_PER_INCH) * TARGET_PPI);
      const [w = 0, h = 0] = turned
        ? [meta.height, meta.width]
        : [meta.width, meta.height];
      if (w <= width * SLACK && h <= height * SLACK) continue;
      const resized = sharp(input)
        .rotate()
        .resize({ width, height, fit: 'inside' });
      const output = await (
        meta.format === 'png'
          ? resized.png({ compressionLevel: 9 })
          : resized.jpeg({ quality: 85 })
      ).toBuffer();
      if (output.length >= input.length) continue;
      zip.file(media, output, { date: file.date, binary: true });
      changed = true;
    } catch {
      // A broken image stays as it was; LibreOffice handles it or not, as before.
    }
  }
  return changed
    ? zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
    : docx;
}
