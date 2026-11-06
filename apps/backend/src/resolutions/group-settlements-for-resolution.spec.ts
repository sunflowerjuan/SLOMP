import { describe, expect, it } from 'vitest';
import { groupSettlementsForResolution } from './group-settlements-for-resolution.js';

const CURRENT_YEAR = 2026; // prescription risk: period <= 2021

describe('groupSettlementsForResolution', () => {
  it('returns only the same-kind siblings of the trigger settlement', () => {
    const settlements = [
      { id: 1, period: 2018 }, // prescription risk
      { id: 2, period: 2020 }, // prescription risk
      { id: 3, period: 2023 }, // normal
      { id: 4, period: 2025 }, // normal
    ];

    const prescriptionGroup = groupSettlementsForResolution(
      settlements,
      1,
      CURRENT_YEAR,
    );
    expect(prescriptionGroup.map((s) => s.id)).toEqual([1, 2]);

    const normalGroup = groupSettlementsForResolution(
      settlements,
      3,
      CURRENT_YEAR,
    );
    expect(normalGroup.map((s) => s.id)).toEqual([3, 4]);
  });

  it('sorts the returned group by period ascending, regardless of input order', () => {
    const settlements = [
      { id: 1, period: 2025 },
      { id: 2, period: 2022 },
      { id: 3, period: 2024 },
    ];

    const group = groupSettlementsForResolution(settlements, 1, CURRENT_YEAR);
    expect(group.map((s) => s.period)).toEqual([2022, 2024, 2025]);
  });

  it('returns a group of one when there are no same-kind siblings', () => {
    const settlements = [
      { id: 1, period: 2018 },
      { id: 2, period: 2025 },
    ];

    expect(
      groupSettlementsForResolution(settlements, 1, CURRENT_YEAR).map(
        (s) => s.id,
      ),
    ).toEqual([1]);
  });

  it('respects the prescription-risk boundary (period <= currentYear - 5)', () => {
    const settlements = [
      { id: 1, period: 2021 }, // risk (2026 - 5)
      { id: 2, period: 2022 }, // normal
    ];

    expect(
      groupSettlementsForResolution(settlements, 1, CURRENT_YEAR).map(
        (s) => s.id,
      ),
    ).toEqual([1]);
    expect(
      groupSettlementsForResolution(settlements, 2, CURRENT_YEAR).map(
        (s) => s.id,
      ),
    ).toEqual([2]);
  });

  it('throws when the trigger settlement is not in the list', () => {
    expect(() =>
      groupSettlementsForResolution(
        [{ id: 1, period: 2024 }],
        99,
        CURRENT_YEAR,
      ),
    ).toThrow(/not in the given settlement list/);
  });
});
