import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { JobError } from './errors.ts';

// Fills a .docx template with docxtemplater. The worker has no business rules:
// `data` arrives already built by the backend and is rendered as-is.
export function renderDocx(
  template: Buffer,
  data: Record<string, unknown>,
): Buffer {
  let document: Docxtemplater;
  try {
    document = new Docxtemplater(new PizZip(template), { paragraphLoop: true });
  } catch (error) {
    throw new JobError(
      'PDF_TEMPLATE_INVALID',
      'The template is not a valid .docx or has malformed placeholders.',
      undefined,
      { cause: error },
    );
  }
  try {
    document.render(data);
  } catch (error) {
    throw new JobError(
      'TEMPLATE_RENDER_FAILED',
      'The data does not fit the template.',
      undefined,
      { cause: error },
    );
  }
  return document.getZip().generate({ type: 'nodebuffer' });
}
