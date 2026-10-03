import { describe, expect, it } from 'vitest';
import {
  currentYearInColombia,
  isPrescriptionRisk,
  isValidPeriod,
} from './period-rules.js';

const YEAR = 2026;

describe('isValidPeriod', () => {
  it.each([
    [1979, false],
    [1980, true],
    [YEAR - 5, true],
    [YEAR - 4, true],
    [YEAR, true],
    [YEAR + 1, false],
  ])('period %i in %i -> %s', (period, expected) => {
    expect(isValidPeriod(period, YEAR)).toBe(expected);
  });

  it('rejects non-integer periods', () => {
    expect(isValidPeriod(2024.5, YEAR)).toBe(false);
    expect(isValidPeriod(Number.NaN, YEAR)).toBe(false);
  });

  it('moves the upper bound with the injected year', () => {
    expect(isValidPeriod(2027, 2026)).toBe(false);
    expect(isValidPeriod(2027, 2027)).toBe(true);
  });
});

describe('isPrescriptionRisk', () => {
  it.each([
    [1979, true],
    [1980, true],
    [YEAR - 5, true], // 2021 in 2026: the cut-off itself is at risk
    [YEAR - 4, false], // 2022 in 2026
    [YEAR, false],
    [YEAR + 1, false],
  ])('period %i in 2026 -> %s', (period, expected) => {
    expect(isPrescriptionRisk(period, YEAR)).toBe(expected);
  });

  it('moves the cut-off with the injected year', () => {
    expect(isPrescriptionRisk(2022, 2026)).toBe(false);
    expect(isPrescriptionRisk(2022, 2027)).toBe(true);
  });
});

describe('currentYearInColombia', () => {
  it('uses the Bogota year, not the UTC one, around New Year', () => {
    // 2027-01-01 02:00 UTC is still 2026-12-31 21:00 in Bogota (UTC-5).
    expect(currentYearInColombia(new Date('2027-01-01T02:00:00Z'))).toBe(2026);
    expect(currentYearInColombia(new Date('2027-01-01T05:00:00Z'))).toBe(2027);
  });
});
