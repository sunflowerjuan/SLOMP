import { SettlementStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  isMissingPeriodAlert,
  isPrescriptionRiskAlert,
  summarizeAlerts,
} from './alert-rules.js';
import type { AlertSettlement } from './alert-rules.js';

const YEAR = 2026;
const row = (extra: Partial<AlertSettlement> = {}): AlertSettlement => ({
  propertyId: 1,
  period: 2021,
  status: SettlementStatus.VIGENTE,
  replacedAt: null,
  missingSince: null,
  ...extra,
});

describe('isPrescriptionRiskAlert', () => {
  it('counts the year minus 5 but not minus 4', () => {
    expect(isPrescriptionRiskAlert(row({ period: 2021 }), YEAR)).toBe(true);
    expect(isPrescriptionRiskAlert(row({ period: 2022 }), YEAR)).toBe(false);
  });

  it('skips PAGADA and PRESCRITA but keeps the other states', () => {
    expect(
      isPrescriptionRiskAlert(row({ status: SettlementStatus.PAGADA }), YEAR),
    ).toBe(false);
    expect(
      isPrescriptionRiskAlert(
        row({ status: SettlementStatus.PRESCRITA }),
        YEAR,
      ),
    ).toBe(false);
    expect(
      isPrescriptionRiskAlert(row({ status: SettlementStatus.EN_FIRME }), YEAR),
    ).toBe(true);
  });

  it('skips a replaced settlement', () => {
    expect(isPrescriptionRiskAlert(row({ replacedAt: new Date() }), YEAR)).toBe(
      false,
    );
  });
});

describe('isMissingPeriodAlert', () => {
  const since = new Date('2026-05-01');

  it('needs missingSince and VIGENTE', () => {
    expect(isMissingPeriodAlert(row({ missingSince: since }))).toBe(true);
    expect(isMissingPeriodAlert(row())).toBe(false);
    expect(
      isMissingPeriodAlert(
        row({ missingSince: since, status: SettlementStatus.PAGADA }),
      ),
    ).toBe(false);
  });

  it('skips a replaced settlement', () => {
    expect(
      isMissingPeriodAlert(
        row({ missingSince: since, replacedAt: new Date() }),
      ),
    ).toBe(false);
  });
});

describe('summarizeAlerts', () => {
  it('counts both alerts, groups risk by period and counts distinct properties', () => {
    const since = new Date('2026-05-01');
    const summary = summarizeAlerts(
      [
        row({ period: 2020 }),
        row({ period: 2020, propertyId: 2 }),
        row({ period: 2021 }),
        row({ period: 2020, status: SettlementStatus.PAGADA }),
        row({ period: 2024, missingSince: since }),
        row({ period: 2025, missingSince: since }),
        row({ period: 2025, propertyId: 3, missingSince: since }),
      ],
      YEAR,
    );

    expect(summary).toEqual({
      prescriptionRisk: {
        count: 3,
        byPeriod: [
          { period: 2020, count: 2 },
          { period: 2021, count: 1 },
        ],
      },
      missingPeriods: { count: 3, properties: 2 },
    });
  });

  it('is all zeros with nothing to report', () => {
    expect(summarizeAlerts([], YEAR)).toEqual({
      prescriptionRisk: { count: 0, byPeriod: [] },
      missingPeriods: { count: 0, properties: 0 },
    });
  });
});
