import { describe, expect, it } from 'vitest';
import {
  isValidDaneCode,
  isValidSlug,
  MAX_SLUG_LENGTH,
  suggestSlug,
} from './municipality-rules.js';

describe('isValidDaneCode', () => {
  it.each(['15514', '19517', '00001'])('accepts %s', (code) => {
    expect(isValidDaneCode(code)).toBe(true);
  });

  it.each([
    '',
    '1551',
    '155140',
    'abcde',
    '1551a',
    ' 15514',
    '15514 ',
    '15.14',
  ])('rejects "%s"', (code) => {
    expect(isValidDaneCode(code)).toBe(false);
  });
});

describe('isValidSlug', () => {
  it.each(['paez', 'paez-cauca', 'paez-19517', 'a', 'san-jose-de-pare'])(
    'accepts %s',
    (slug) => {
      expect(isValidSlug(slug)).toBe(true);
    },
  );

  it.each([
    '',
    'Paez',
    'páez',
    'paez cauca',
    'paez_cauca',
    '-paez',
    'paez-',
    'paez--cauca',
    'paez/cauca',
  ])('rejects "%s"', (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });

  it('rejects a slug over the maximum length', () => {
    expect(isValidSlug('a'.repeat(MAX_SLUG_LENGTH))).toBe(true);
    expect(isValidSlug('a'.repeat(MAX_SLUG_LENGTH + 1))).toBe(false);
  });
});

describe('suggestSlug', () => {
  it.each([
    ['Páez', 'paez'],
    ['San José de Pare', 'san-jose-de-pare'],
    ['  Güicán de la Sierra ', 'guican-de-la-sierra'],
    ['Paez (Cauca)', 'paez-cauca'],
    ['Nuñez', 'nunez'],
  ])('turns "%s" into "%s"', (name, slug) => {
    expect(suggestSlug(name)).toBe(slug);
  });

  it('always produces a valid slug for a normal name', () => {
    expect(isValidSlug(suggestSlug('Santa María del Río'))).toBe(true);
  });

  it('returns an empty string when the name has nothing usable', () => {
    expect(suggestSlug('***')).toBe('');
  });

  it.each([
    ['-paez', 'paez'],
    ['paez-', 'paez'],
    ['--paez--cauca--', 'paez-cauca'],
    ['---', ''],
    ['', ''],
  ])('drops leading, trailing and repeated hyphens: "%s"', (name, slug) => {
    expect(suggestSlug(name)).toBe(slug);
  });

  it('handles 100 000 hyphens in linear time', () => {
    const started = performance.now();
    expect(suggestSlug('-'.repeat(100_000))).toBe('');
    expect(suggestSlug(`a${'-'.repeat(100_000)}`)).toBe('a');
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('never ends in a hyphen after truncating a long name', () => {
    const slug = suggestSlug(`${'a'.repeat(MAX_SLUG_LENGTH - 1)} b`);
    expect(slug.endsWith('-')).toBe(false);
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH);
  });
});
