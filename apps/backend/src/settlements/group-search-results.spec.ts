import { ResolutionKind, SettlementStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { groupSettlementsByResolution } from './group-search-results.js';

const YEAR = 2026;
const row = (
  id: number,
  period: number,
  extra: Partial<
    Parameters<typeof groupSettlementsByResolution>[0][number]
  > = {},
) => ({
  id,
  period,
  status: SettlementStatus.VIGENTE,
  totalAmount: 100,
  missingSince: null,
  resolution: null,
  ...extra,
});
const RES_A = {
  id: 1,
  number: 'LOIP 15514 2026-0001',
  kind: ResolutionKind.NORMAL,
};

describe('groupSettlementsByResolution', () => {
  it('splits the settlements without a resolution into one future group per kind', () => {
    const groups = groupSettlementsByResolution(
      [row(1, 2018), row(2, 2020), row(3, 2024), row(4, 2025)],
      YEAR,
    );

    expect(groups).toEqual([
      expect.objectContaining({
        settlementId: 1,
        resolutionNumber: null,
        kind: ResolutionKind.PRESCRIPTION_RISK,
        periods: [2018, 2020],
        totalAmount: 200,
      }),
      expect.objectContaining({
        settlementId: 3,
        resolutionNumber: null,
        kind: ResolutionKind.NORMAL,
        periods: [2024, 2025],
      }),
    ]);
  });

  it('keeps the settlements of a generated resolution together and shows its number', () => {
    const groups = groupSettlementsByResolution(
      [
        row(2, 2025, { resolution: RES_A }),
        row(1, 2024, { resolution: RES_A }),
        row(3, 2026),
      ],
      YEAR,
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      settlementId: 1,
      resolutionNumber: RES_A.number,
      kind: ResolutionKind.NORMAL,
      periods: [2024, 2025],
    });
    expect(groups[1]).toMatchObject({
      resolutionNumber: null,
      periods: [2026],
    });
  });

  it('reports one status for the group, or MIXED when the periods disagree', () => {
    const same = groupSettlementsByResolution(
      [
        row(1, 2024, { status: SettlementStatus.PAGADA }),
        row(2, 2025, { status: SettlementStatus.PAGADA }),
      ],
      YEAR,
    );
    const mixed = groupSettlementsByResolution(
      [row(1, 2024), row(2, 2025, { status: SettlementStatus.PAGADA })],
      YEAR,
    );

    expect(same[0].status).toBe(SettlementStatus.PAGADA);
    expect(mixed[0].status).toBe('MIXED');
  });

  describe('missing periods (SL-136)', () => {
    const MISSED = new Date('2026-10-13T00:00:00Z');

    it('lists the periods of each group that the latest tax roll no longer brings', () => {
      const groups = groupSettlementsByResolution(
        [
          row(1, 2014),
          row(2, 2015, { missingSince: MISSED }),
          row(3, 2016),
          row(4, 2025),
        ],
        YEAR,
      );

      expect(groups.map((group) => group.missingPeriods)).toEqual([[2015], []]);
    });

    it.each([
      SettlementStatus.EN_FIRME,
      SettlementStatus.PAGADA,
      SettlementStatus.ACUERDO_DE_PAGO,
      SettlementStatus.PRESCRITA,
    ])('drops the mark once the period is %s', (status) => {
      const [group] = groupSettlementsByResolution(
        [row(1, 2015, { missingSince: MISSED, status })],
        YEAR,
      );

      expect(group.missingPeriods).toEqual([]);
    });
  });

  it('adds the amounts without floating point drift', () => {
    const [group] = groupSettlementsByResolution(
      [row(1, 2024, { totalAmount: 0.1 }), row(2, 2025, { totalAmount: 0.2 })],
      YEAR,
    );
    expect(group.totalAmount).toBe(0.3);
  });
});
