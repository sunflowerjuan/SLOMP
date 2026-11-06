import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createProfile,
  isCompletePdf,
  resolveSofficeBinary,
} from '../src/soffice.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isCompletePdf', () => {
  it('needs the PDF header and the EOF marker', () => {
    expect(isCompletePdf(Buffer.from('%PDF-1.7 ... %%EOF'))).toBe(true);
    expect(isCompletePdf(Buffer.from('%PDF-1.7 truncated'))).toBe(false);
    expect(isCompletePdf(Buffer.from('<html>%%EOF'))).toBe(false);
  });
});

describe('createProfile', () => {
  it('seeds the profile with macros disabled and the PDF export options before LibreOffice starts', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'profile-test-'));
    try {
      await createProfile(dir);
      const xcu = await readFile(
        join(dir, 'user', 'registrymodifications.xcu'),
        'utf8',
      );
      expect(xcu).toContain(
        '<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value>',
      );
      expect(xcu).toContain(
        '<prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value>',
      );
      expect(xcu).toContain(
        '<prop oor:name="UseTaggedPDF" oor:op="fuse"><value>false</value>',
      );
      expect(xcu).toContain(
        '<prop oor:name="ExportBookmarksToPDFDestination" oor:op="fuse"><value>true</value>',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveSofficeBinary', () => {
  it('uses LIBREOFFICE_BIN, otherwise only the known locations', () => {
    vi.stubEnv('LIBREOFFICE_BIN', '/custom/soffice');
    expect(resolveSofficeBinary([])).toBe('/custom/soffice');
    vi.stubEnv('LIBREOFFICE_BIN', '');
    expect(() => resolveSofficeBinary(['/does/not/exist'])).toThrow(
      /LIBREOFFICE_BIN/,
    );
  });
});
