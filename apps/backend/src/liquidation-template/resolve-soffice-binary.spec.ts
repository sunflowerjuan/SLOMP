import { afterEach, describe, expect, it } from 'vitest';
import { resolveSofficeBinary } from './resolve-soffice-binary.js';

const ORIGINAL_OVERRIDE = process.env.LIBREOFFICE_BIN;

describe('resolveSofficeBinary', () => {
  afterEach(() => {
    if (ORIGINAL_OVERRIDE === undefined) {
      delete process.env.LIBREOFFICE_BIN;
    } else {
      process.env.LIBREOFFICE_BIN = ORIGINAL_OVERRIDE;
    }
  });

  it('returns LIBREOFFICE_BIN as-is when set, without checking the filesystem', () => {
    process.env.LIBREOFFICE_BIN = '/some/custom/path/soffice';
    expect(resolveSofficeBinary()).toBe('/some/custom/path/soffice');
  });

  it('throws a clear error when no override is set and none of the candidate paths exist', () => {
    process.env.LIBREOFFICE_BIN = '';
    expect(() =>
      resolveSofficeBinary([
        '/nonexistent/one/soffice',
        '/nonexistent/two/soffice',
      ]),
    ).toThrow(/LIBREOFFICE_BIN/);
  });

  it('returns the first candidate path that exists on disk', () => {
    process.env.LIBREOFFICE_BIN = '';
    // __filename always exists -- stands in for a real soffice location
    // without depending on LibreOffice actually being installed here.
    expect(
      resolveSofficeBinary(['/nonexistent/soffice', import.meta.filename]),
    ).toBe(import.meta.filename);
  });
});
