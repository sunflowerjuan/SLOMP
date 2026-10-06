import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { resolveSofficeBinary } from './resolve-soffice-binary.js';
import { isCompletePdf, PdfConversionError } from './convert-docx-to-pdf.js';
import { ErrorCode } from '../common/errors/error-codes.js';

const execFileAsync = promisify(execFile);

export async function convertDocxBatchToPdf(
  docs: { name: string; docx: Buffer }[],
  directory: string,
  profileDir: string,
): Promise<Map<string, { pdf?: Buffer; error?: PdfConversionError }>> {
  const results = new Map<
    string,
    { pdf?: Buffer; error?: PdfConversionError }
  >();
  const paths = await Promise.all(
    docs.map(async ({ name, docx }) => {
      const path = join(directory, `${name}.docx`);
      await writeFile(path, docx);
      return path;
    }),
  );
  try {
    await execFileAsync(
      resolveSofficeBinary(),
      [
        '--headless',
        '--norestore',
        `-env:UserInstallation=file://${profileDir}`,
        '--convert-to',
        'pdf',
        '--outdir',
        directory,
        ...paths,
      ],
      { timeout: 25_000 + 5_000 * docs.length },
    );
  } catch (cause) {
    const killed = (cause as NodeJS.ErrnoException & { killed?: boolean })
      .killed;
    const error = new PdfConversionError(
      killed
        ? ErrorCode.PDF_CONVERSION_TIMEOUT
        : ErrorCode.PDF_CONVERSION_FAILED,
      killed
        ? 'PDF batch conversion timed out.'
        : 'LibreOffice could not convert the PDF batch.',
      { cause },
    );
    for (const doc of docs) results.set(doc.name, { error });
    return results;
  }
  for (const doc of docs) {
    try {
      const pdf = await readFile(join(directory, `${doc.name}.pdf`));
      if (!isCompletePdf(pdf)) throw new Error('Invalid PDF output');
      results.set(doc.name, { pdf });
    } catch (cause) {
      results.set(doc.name, {
        error: new PdfConversionError(
          ErrorCode.PDF_CONVERSION_FAILED,
          'LibreOffice produced an invalid PDF.',
          { cause },
        ),
      });
    }
  }
  return results;
}
