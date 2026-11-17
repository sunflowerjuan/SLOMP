import { SettlementStatus } from '@prisma/client';
import { isPrescriptionRisk } from '../tax-roll/period-rules.js';
import { isMissingPeriod } from './group-search-results.js';

// Rules of the portfolio alert summary (SL-132). Pure: the year is injected.
// They reuse the SL-136 rules and only add what the summary needs on top.

export interface AlertSettlement {
  propertyId: number;
  period: number;
  status: SettlementStatus;
  replacedAt: Date | null;
  missingSince: Date | null;
}

export interface AlertsSummary {
  prescriptionRisk: {
    count: number;
    byPeriod: { period: number; count: number }[];
  };
  missingPeriods: { count: number; properties: number };
}

// Alive, old enough and not already settled (PAGADA) or prescribed.
export function isPrescriptionRiskAlert(
  settlement: AlertSettlement,
  currentYear: number,
): boolean {
  return (
    settlement.replacedAt === null &&
    isPrescriptionRisk(settlement.period, currentYear) &&
    settlement.status !== SettlementStatus.PAGADA &&
    settlement.status !== SettlementStatus.PRESCRITA
  );
}

export function isMissingPeriodAlert(settlement: AlertSettlement): boolean {
  return settlement.replacedAt === null && isMissingPeriod(settlement);
}

// Counts only: no cadastral code, name or address ever leaves here.
export function summarizeAlerts(
  settlements: AlertSettlement[],
  currentYear: number,
): AlertsSummary {
  const byPeriod = new Map<number, number>();
  const missingProperties = new Set<number>();
  let missingCount = 0;
  let riskCount = 0;

  for (const settlement of settlements) {
    if (isPrescriptionRiskAlert(settlement, currentYear)) {
      riskCount += 1;
      byPeriod.set(
        settlement.period,
        (byPeriod.get(settlement.period) ?? 0) + 1,
      );
    }
    if (isMissingPeriodAlert(settlement)) {
      missingCount += 1;
      missingProperties.add(settlement.propertyId);
    }
  }

  return {
    prescriptionRisk: {
      count: riskCount,
      byPeriod: [...byPeriod]
        .map(([period, count]) => ({ period, count }))
        .sort((a, b) => a.period - b.period),
    },
    missingPeriods: { count: missingCount, properties: missingProperties.size },
  };
}
