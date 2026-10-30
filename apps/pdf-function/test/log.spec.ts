import { describe, expect, it } from 'vitest';
import { sanitizeForLog } from '../src/log.ts';

describe('sanitizeForLog', () => {
  it('drops CR, LF and other control characters', () => {
    expect(sanitizeForLog('GET /x\r\nFAKE log\tline\u0000\u2028')).toBe(
      'GET /xFAKE logline',
    );
  });

  it('keeps ordinary text, accents included', () => {
    expect(sanitizeForLog('POST /render?municipio=Páez')).toBe(
      'POST /render?municipio=Páez',
    );
  });

  it('caps the value at 200 characters', () => {
    expect(sanitizeForLog('a'.repeat(500))).toBe('a'.repeat(200));
    expect(sanitizeForLog(`${'\n'.repeat(50)}${'b'.repeat(300)}`)).toBe(
      'b'.repeat(200),
    );
  });
});
