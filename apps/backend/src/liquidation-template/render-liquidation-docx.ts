import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import type { LiquidationTemplateData } from './liquidation-template-data.js';

export class LiquidationTemplateError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LiquidationTemplateError';
  }
}

// Hardcoded path, same as liquidation-template.spec.ts: the real template is
// client material and isn't versioned in git (see templates/.gitkeep).
// Reading it from a Blob-referenced path instead of this fixed path is
// separate, not-yet-started future work -- this isn't an oversight.
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
    throw new LiquidationTemplateError(
      'The liquidation template is unavailable. Verify that the .docx template is installed in the configured location.',
    );
  }

  try {
    const zip = new PizZip(templateBuffer);
    const document = new Docxtemplater(zip, { paragraphLoop: true });
    document.render(data);
    return document.getZip().generate({ type: 'nodebuffer' });
  } catch (error) {
    throw new LiquidationTemplateError(
      'The liquidation template is invalid or corrupted. Replace it with a valid .docx template.',
      { cause: error },
    );
  }
}
