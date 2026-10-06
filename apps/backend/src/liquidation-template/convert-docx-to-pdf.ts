import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { resolveSofficeBinary } from './resolve-soffice-binary.js';
import { CodedError } from '../common/errors/coded-error.js';
import { ErrorCode } from '../common/errors/error-codes.js';

const execFileAsync = promisify(execFile);

// Generous enough to absorb LibreOffice's cold-start profile bootstrap (each
// call gets its own fresh -env:UserInstallation) plus the actual conversion,
// while still bounding a hung/unresponsive soffice process.
export const CONVERT_TIMEOUT_MS = 25_000;

export class PdfConversionError extends CodedError {
  constructor(
    code:
      | typeof ErrorCode.PDF_CONVERSION_TIMEOUT
      | typeof ErrorCode.PDF_CONVERSION_FAILED,
    message: string,
    options?: ErrorOptions,
  ) {
    super(code, message, undefined, options);
    this.name = 'PdfConversionError';
  }
}

export function isCompletePdf(pdf: Buffer): boolean {
  // A successful process can still leave a stale or partial output file. The
  // PDF header plus its mandatory EOF marker are a cheap, format-level guard
  // before a binary response is ever sent to the caller.
  return (
    pdf.length > 5 &&
    pdf.subarray(0, 5).toString('ascii') === '%PDF-' &&
    pdf.lastIndexOf(Buffer.from('%%EOF')) !== -1
  );
}

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
      // without one. Resolved to a fixed absolute path, never searched via
      // PATH (which could be attacker-controlled).
      await execFileAsync(
        resolveSofficeBinary(),
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
      const processError = error as NodeJS.ErrnoException & {
        killed?: boolean;
      };
      if (processError.killed) {
        throw new PdfConversionError(
          ErrorCode.PDF_CONVERSION_TIMEOUT,
          'PDF generation timed out after 25 seconds. Please try again; if the problem persists, contact support.',
          { cause: error },
        );
      }
      throw new PdfConversionError(
        ErrorCode.PDF_CONVERSION_FAILED,
        'LibreOffice could not convert the liquidation to PDF. Please try again; if the problem persists, contact support.',
        { cause: error },
      );
    }

    const pdfPath = join(dir, 'liquidacion.pdf');
    let pdf: Buffer;
    try {
      pdf = await readFile(pdfPath);
    } catch {
      throw new PdfConversionError(
        ErrorCode.PDF_CONVERSION_FAILED,
        'LibreOffice finished without producing a valid PDF. Please try again; if the problem persists, contact support.',
      );
    }
    if (!isCompletePdf(pdf)) {
      throw new PdfConversionError(
        ErrorCode.PDF_CONVERSION_FAILED,
        'LibreOffice produced an invalid PDF. No file was generated; please try again.',
      );
    }
    return pdf;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
