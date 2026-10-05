import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Generous enough to absorb LibreOffice's cold-start profile bootstrap (each
// call gets its own fresh -env:UserInstallation, see below) plus the actual
// conversion, while still bounding a hung/unresponsive soffice process.
export const CONVERT_TIMEOUT_MS = 25_000;

// Converts a .docx buffer to PDF via headless LibreOffice. Never persists
// anything: everything happens inside one unique temp directory, deleted
// before this function returns (success or failure) -- the only artifact
// that survives is the PDF Buffer this returns to the caller.
export async function convertDocxToPdf(docx: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'liquidation-pdf-'));
  try {
    const docxPath = join(dir, 'liquidacion.docx');
    await writeFile(docxPath, docx);

    try {
      // A unique -env:UserInstallation profile per call: concurrent headless
      // soffice invocations collide on the default shared profile lock
      // without one.
      await execFileAsync(
        'soffice',
        [
          '--headless',
          '--norestore',
          `-env:UserInstallation=file://${join(dir, 'profile')}`,
          '--convert-to',
          'pdf',
          '--outdir',
          dir,
          docxPath,
        ],
        { timeout: CONVERT_TIMEOUT_MS },
      );
    } catch (error) {
      throw new Error(
        `LibreOffice failed to convert the liquidation to PDF: ${(error as Error).message}`,
        { cause: error },
      );
    }

    const pdfPath = join(dir, 'liquidacion.pdf');
    try {
      return await readFile(pdfPath);
    } catch {
      throw new Error(
        'LibreOffice finished but produced no PDF output for the liquidation.',
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
