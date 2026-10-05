import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type { LiquidationTemplateData } from './liquidation-template-data.js';

// Hardcoded path, same as liquidation-template.spec.ts: the real template is
// client material and isn't versioned in git (see templates/.gitkeep).
// Reading it from a Blob-referenced path instead of this fixed path is SL-91,
// not yet started -- this isn't an oversight.
export const TEMPLATE_PATH = resolve(
  process.cwd(),
  'templates/liquidacion-paez.docx',
);

export function renderLiquidationDocx(
  data: LiquidationTemplateData,
  templatePath: string = TEMPLATE_PATH,
): Buffer {
  let templateBuffer: Buffer;
  try {
    templateBuffer = readFileSync(templatePath);
  } catch {
    throw new Error(`Liquidation template not found at ${templatePath}.`);
  }

  const zip = new PizZip(templateBuffer);
  const document = new Docxtemplater(zip, { paragraphLoop: true });
  document.render(data);
  return document.getZip().generate({ type: 'nodebuffer' });
}
