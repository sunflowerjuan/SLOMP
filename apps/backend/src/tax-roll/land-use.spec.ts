import { describe, expect, it } from 'vitest';
import { LandUse, parseLandUse } from './land-use.js';

describe('parseLandUse', () => {
  it.each([
    ['rural', LandUse.RURAL],
    ['urbano', LandUse.URBAN],
  ])('maps the tax roll value %s', (value, expected) => {
    expect(parseLandUse(value)).toBe(expected);
  });

  it.each(['RURAL', '  Urbano ', 'Rúral', 'URBANO\t'])(
    'ignores case, surrounding whitespace and accents (%j)',
    (value) => {
      expect(parseLandUse(value)).not.toBeNull();
    },
  );

  it.each(['', '   ', 'Residencial', 'urban', 'urbana', 'rural urbano'])(
    'returns null for a blank or unknown value (%j) instead of keeping free text',
    (value) => {
      expect(parseLandUse(value)).toBeNull();
    },
  );
});
