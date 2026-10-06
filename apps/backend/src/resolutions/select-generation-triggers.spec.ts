import { ResolutionKind } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectGenerationTriggers } from './select-generation-triggers.js';

const CURRENT_YEAR = 2026;

describe('selectGenerationTriggers', () => {
  it('returns one trigger per property', () => {
    const triggers = selectGenerationTriggers(
      [
        { id: 1, propertyId: 10, period: 2025 },
        { id: 2, propertyId: 10, period: 2024 },
      ],
      CURRENT_YEAR,
    );

    expect(triggers).toEqual([
      { id: 1, propertyId: 10, kind: ResolutionKind.NORMAL },
    ]);
  });

  it('returns a separate trigger per kind within the same property', () => {
    const triggers = selectGenerationTriggers(
      [
        { id: 1, propertyId: 10, period: 2025 }, // normal
        { id: 2, propertyId: 10, period: 2018 }, // prescription risk
      ],
      CURRENT_YEAR,
    );

    expect(triggers).toHaveLength(2);
    expect(triggers).toContainEqual({
      id: 1,
      propertyId: 10,
      kind: ResolutionKind.NORMAL,
    });
    expect(triggers).toContainEqual({
      id: 2,
      propertyId: 10,
      kind: ResolutionKind.PRESCRIPTION_RISK,
    });
  });

  it('returns a trigger per property even when properties share a kind', () => {
    const triggers = selectGenerationTriggers(
      [
        { id: 1, propertyId: 10, period: 2025 },
        { id: 2, propertyId: 20, period: 2024 },
      ],
      CURRENT_YEAR,
    );

    expect(triggers.map((t) => t.propertyId).sort()).toEqual([10, 20]);
  });

  it('returns an empty list for an empty portfolio', () => {
    expect(selectGenerationTriggers([], CURRENT_YEAR)).toEqual([]);
  });
});
