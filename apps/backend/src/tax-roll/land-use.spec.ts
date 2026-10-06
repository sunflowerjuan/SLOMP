import { describe, expect, it } from 'vitest';
import { LandUse, parseLandUse } from './land-use.js';

describe('parseLandUse', () => {
  it.each([
    ['rural', LandUse.RURAL],
    ['urbano', LandUse.URBAN],
  ])('maps the tax roll value %s', (value, expected) => {
    expect(parseLandUse(value)).toBe(expected);
  });

  it.each([
    ['RURAL', LandUse.RURAL],
    ['  Urbano ', LandUse.URBAN],
    ['Rúral', LandUse.RURAL],
    ['URBANO\t', LandUse.URBAN],
  ])(
    'ignores case, surrounding whitespace and accents (%j)',
    (value, expected) => {
      expect(parseLandUse(value)).toBe(expected);
    },
  );

  it.each(['', '   ', 'Residencial', 'urban', 'urbana', 'rural urbano'])(
    'returns null for a blank or unknown value (%j) instead of keeping free text',
    (value) => {
      expect(parseLandUse(value)).toBeNull();
    },
  );
});
