import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSofficeBinary } from './resolve-soffice-binary.js';
import { loadTemplateFixture } from './test-fixture-docx.js';

function hasSoffice(): boolean {
  try {
    resolveSofficeBinary();
    return true;
  } catch {
    return false;
  }
}

// LibreOffice isn't installed on every dev/CI machine -- skip rather than
// fail when it's genuinely absent, same spirit as liquidation-template.spec.ts
// falling back to an in-memory fixture when the real template is missing.
describe.skipIf(!hasSoffice())('convertDocxToPdf (real soffice)', () => {
  it('converts a rendered docx into a non-empty PDF buffer', async () => {
    const { convertDocxToPdf } = await import('./convert-docx-to-pdf.js');
    const zip = new PizZip(loadTemplateFixture());
    const document = new Docxtemplater(zip, { paragraphLoop: true });
    document.render({
      resolutionNumber: '2026-0042',
      cadastralCode: '155140001000000010019000000000',
      propertyName: 'LA FORTUNA VDA EL OSO',
      owners: 'NELLY PINEDA PENA',
      startYear: '2024',
      endYear: '2024',
      totalAmount: '$ 110.000',
      capitalAmount: '$ 100.000',
      interestAmount: '$ 10.000',
      rows: [],
    });
    const docx = document.getZip().generate({ type: 'nodebuffer' });

    const pdf = await convertDocxToPdf(docx);

    expect(Buffer.isBuffer(pdf)).toBe(true);
    // %PDF- magic bytes.
    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  }, 30_000);
});

// LibreOffice is too permissive to reliably fail on "bad input" (it falls
// back to reading unrecognized content as plain text and still produces a
// PDF) -- the real failure modes are the process itself erroring (missing
// binary, crash, non-zero exit). Simulate that directly instead of hoping
// some input reliably trips it up.
describe('convertDocxToPdf (process failure, no real soffice needed)', () => {
  afterEach(() => {
    vi.doUnmock('node:child_process');
    vi.resetModules();
  });

  it('wraps a failing soffice invocation in a clear error', async () => {
    vi.resetModules();
    vi.doMock('node:child_process', () => ({
      execFile: (
        _cmd: string,
        _args: string[],
        _opts: unknown,
        callback: (error: Error) => void,
      ) => callback(new Error('spawn soffice ENOENT')),
    }));
    const { convertDocxToPdf } = await import('./convert-docx-to-pdf.js');

    await expect(convertDocxToPdf(Buffer.from('anything'))).rejects.toThrow(
      /failed to convert.*ENOENT/is,
    );
  });
});
