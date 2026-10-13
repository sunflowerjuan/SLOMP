import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { JobError } from './errors.ts';

const execFileAsync = promisify(execFile);

// Resolved from a fixed list, never through the ambient PATH (which could
// point at a writable directory). LIBREOFFICE_BIN overrides it.
const KNOWN_SOFFICE_PATHS = [
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
  '/opt/homebrew/bin/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
];

export function resolveSofficeBinary(
  candidates: readonly string[] = KNOWN_SOFFICE_PATHS,
): string {
  const override = process.env.LIBREOFFICE_BIN;
  if (override) return override;
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      'soffice not found in any known location. Set LIBREOFFICE_BIN.',
    );
  }
  return found;
}

// A finished process can still leave a partial file: the header plus the
// mandatory EOF marker are a cheap format-level check.
export function isCompletePdf(pdf: Buffer): boolean {
  return (
    pdf.length > 5 &&
    pdf.subarray(0, 5).toString('ascii') === '%PDF-' &&
    pdf.lastIndexOf(Buffer.from('%%EOF')) !== -1
  );
}

// Seeded into every profile before LibreOffice first starts: highest macro
// security and macro execution disabled. Templates are trusted, but a .docx
// is still a document format that can carry active content.
export const MACRO_LOCKDOWN_XCU = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
</oor:items>
`;

export async function createProfile(dir: string): Promise<void> {
  await mkdir(join(dir, 'user'), { recursive: true });
  await writeFile(
    join(dir, 'user', 'registrymodifications.xcu'),
    MACRO_LOCKDOWN_XCU,
  );
}

/** Converts .docx buffers to PDF; result i is the PDF of input i or its error. */
export type ConvertBatch = (docs: Buffer[]) => Promise<(Buffer | JobError)[]>;

export interface Slot {
  convert: ConvertBatch;
  dispose(): Promise<void>;
}

// One LibreOffice profile per slot, reused for every batch it converts: the
// profile bootstrap is most of the cost of a single conversion (1.33 s fresh
// vs 0.28 s reused per PDF). A slot runs one conversion at a time; concurrent
// soffice runs on the same profile collide on its lock.
export async function createSofficeSlot(timeoutMs: number): Promise<Slot> {
  const root = await mkdtemp(join(tmpdir(), 'pdf-slot-'));
  const profile = join(root, 'profile');
  await createProfile(profile);
  const binary = resolveSofficeBinary();

  async function convert(docs: Buffer[]): Promise<(Buffer | JobError)[]> {
    const dir = await mkdtemp(join(root, 'batch-'));
    try {
      const inputs = await Promise.all(
        docs.map(async (docx, i) => {
          const path = join(dir, `doc-${i}.docx`);
          await writeFile(path, docx);
          return path;
        }),
      );
      try {
        await execFileAsync(
          binary,
          [
            '--headless',
            '--norestore',
            `-env:UserInstallation=${pathToFileURL(profile).href}`,
            '--convert-to',
            'pdf',
            '--outdir',
            dir,
            ...inputs,
          ],
          { timeout: timeoutMs + 5_000 * (docs.length - 1) },
        );
      } catch (cause) {
        const killed = (cause as { killed?: boolean }).killed;
        const error = killed
          ? new JobError(
              'PDF_CONVERSION_TIMEOUT',
              'LibreOffice timed out.',
              undefined,
              { cause },
            )
          : new JobError(
              'PDF_CONVERSION_FAILED',
              'LibreOffice failed.',
              undefined,
              { cause },
            );
        return docs.map(() => error);
      }
      return Promise.all(
        docs.map(async (_, i) => {
          const pdf = await readFile(join(dir, `doc-${i}.pdf`)).catch(
            () => null,
          );
          return pdf && isCompletePdf(pdf)
            ? pdf
            : new JobError(
                'PDF_CONVERSION_FAILED',
                'LibreOffice produced no valid PDF.',
              );
        }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  return {
    convert,
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
