import { describe, expect, it } from 'vitest';
import { checkCadastralDanePrefix } from './validate-dane-prefix.js';

const PAEZ_BOYACA = '15514';
const paezCode = (suffix: string) => `${PAEZ_BOYACA}${suffix}`.padEnd(30, '0');

describe('checkCadastralDanePrefix', () => {
  it('matches when every code starts with the municipality DANE code', () => {
    expect(
      checkCadastralDanePrefix(
        [paezCode('0001'), paezCode('0002')],
        PAEZ_BOYACA,
      ),
    ).toEqual({ matches: true, mismatchedRows: 0, foundPrefixes: [] });
  });

  it('matches an empty list: there is nothing to reject', () => {
    expect(checkCadastralDanePrefix([], PAEZ_BOYACA).matches).toBe(true);
  });

  it('rejects a file that belongs to another registered municipality', () => {
    const cauca = (n: string) => `19517${n}`.padEnd(30, '0');
    const result = checkCadastralDanePrefix(
      [cauca('1'), cauca('2'), cauca('3')],
      PAEZ_BOYACA,
    );

    expect(result).toEqual({
      matches: false,
      mismatchedRows: 3,
      foundPrefixes: [{ prefix: '19517', rows: 3 }],
    });
  });

  it('rejects a file with a prefix nobody has registered', () => {
    const result = checkCadastralDanePrefix(['999990000001'], PAEZ_BOYACA);

    expect(result.matches).toBe(false);
    expect(result.foundPrefixes).toEqual([{ prefix: '99999', rows: 1 }]);
  });

  it('rejects the whole file when a single code does not match', () => {
    const result = checkCadastralDanePrefix(
      [paezCode('1'), paezCode('2'), '190000000001'],
      PAEZ_BOYACA,
    );

    expect(result.matches).toBe(false);
    expect(result.mismatchedRows).toBe(1);
  });

  it('counts only the rows that do not match and lists the most frequent prefix first', () => {
    const result = checkCadastralDanePrefix(
      [
        paezCode('1'),
        '19517A',
        '19517B',
        '19517C',
        '25000A',
        '25000B',
        '00000A',
      ],
      PAEZ_BOYACA,
    );

    expect(result.mismatchedRows).toBe(6);
    expect(result.foundPrefixes).toEqual([
      { prefix: '19517', rows: 3 },
      { prefix: '25000', rows: 2 },
      { prefix: '00000', rows: 1 },
    ]);
  });

  it('reports a code shorter than the DANE code as a mismatch', () => {
    const result = checkCadastralDanePrefix(['155'], PAEZ_BOYACA);

    expect(result.matches).toBe(false);
    expect(result.foundPrefixes).toEqual([{ prefix: '155', rows: 1 }]);
  });

  it('does not treat a DANE code found in the middle of the code as a match', () => {
    expect(
      checkCadastralDanePrefix(['0000015514000'], PAEZ_BOYACA).matches,
    ).toBe(false);
  });
});
