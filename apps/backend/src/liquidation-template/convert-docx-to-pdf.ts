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

// Requests in flight to the PDF service at once. Matches the service's own
// MAX_CONCURRENT_CONVERSIONS default so a bulk job queues here instead of
// being answered with 503.
const PDF_SERVICE_CONCURRENCY = 2;
let inFlight = 0;
const waiting: (() => void)[] = [];

async function withServiceSlot<T>(task: () => Promise<T>): Promise<T> {
  const limit =
    Number(process.env.PDF_SERVICE_CONCURRENCY) || PDF_SERVICE_CONCURRENCY;
  if (inFlight >= limit) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  } else {
    inFlight++;
  }
  try {
    return await task();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else inFlight--;
  }
}

// Sends the .docx to the PDF service (apps/pdf-function) instead of running
// LibreOffice in this process.
async function convertViaService(
  docx: Buffer,
  serviceUrl: string,
): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(`${serviceUrl.replace(/\/+$/, '')}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: new Uint8Array(docx),
      // A little longer than the service's own timeout, so its 504 wins.
      signal: AbortSignal.timeout(CONVERT_TIMEOUT_MS + 5_000),
    });
  } catch (error) {
    const timedOut = (error as Error).name === 'TimeoutError';
    throw new PdfConversionError(
      timedOut
        ? ErrorCode.PDF_CONVERSION_TIMEOUT
        : ErrorCode.PDF_CONVERSION_FAILED,
      timedOut
        ? 'PDF generation timed out. Please try again; if the problem persists, contact support.'
        : 'The PDF service is unreachable. Please try again; if the problem persists, contact support.',
      { cause: error },
    );
  }
  if (!response.ok) {
    const timedOut = response.status === 504;
    throw new PdfConversionError(
      timedOut
        ? ErrorCode.PDF_CONVERSION_TIMEOUT
        : ErrorCode.PDF_CONVERSION_FAILED,
      timedOut
        ? 'PDF generation timed out. Please try again; if the problem persists, contact support.'
        : `The PDF service could not convert the liquidation (HTTP ${response.status}). Please try again; if the problem persists, contact support.`,
    );
  }
  const pdf = Buffer.from(await response.arrayBuffer());
  if (!isCompletePdf(pdf)) {
    throw new PdfConversionError(
      ErrorCode.PDF_CONVERSION_FAILED,
      'The PDF service returned an invalid PDF. No file was generated; please try again.',
    );
  }
  return pdf;
}

// Converts a .docx buffer to PDF. When PDF_SERVICE_URL is set it goes to the
// PDF service; otherwise it runs headless LibreOffice locally. Never persists
// anything: everything happens inside one unique temp directory, deleted
// before this function returns (success or failure) -- the only artifact
// that survives is the PDF Buffer this returns to the caller.
export async function convertDocxToPdf(docx: Buffer): Promise<Buffer> {
  const serviceUrl = process.env.PDF_SERVICE_URL;
  if (serviceUrl) {
    return withServiceSlot(() => convertViaService(docx, serviceUrl));
  }
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
