import { ResolutionKind, SettlementStatus } from '@prisma/client';
import { isPrescriptionRisk } from '../tax-roll/period-rules.js';

export interface SearchableSettlement {
  id: number;
  period: number;
  status: SettlementStatus;
  totalAmount: number;
  // Set when a later tax roll import stopped bringing this period.
  missingSince: Date | null;
  resolution: { id: number; number: string; kind: ResolutionKind } | null;
}

export interface SettlementGroup {
  // Any settlement of the group works as the trigger for the PDF and the
  // status change: both cover the whole group. This is the earliest period.
  settlementId: number;
  resolutionNumber: string | null;
  kind: ResolutionKind;
  periods: number[];
  // 'MIXED' only for legacy data where the periods of one resolution were
  // changed one by one.
  status: SettlementStatus | 'MIXED';
  totalAmount: number;
  // Periods of the group that the latest tax roll no longer brings (SL-136).
  missingPeriods: number[];
}

// A period absent from the latest tax roll only needs attention while it is
// still VIGENTE: once its state changes, the Administrator already acted.
export function isMissingPeriod(settlement: {
  status: SettlementStatus;
  missingSince: Date | null;
}): boolean {
  return (
    settlement.missingSince !== null &&
    settlement.status === SettlementStatus.VIGENTE
  );
}

// Groups ONE property's current settlements the way a PDF is generated: the
// ones already in a Resolution stay together; the rest (no resolution yet)
// form one future Resolution per kind (prescription risk / normal).
export function groupSettlementsByResolution(
  settlements: SearchableSettlement[],
  currentYear: number,
): SettlementGroup[] {
  const buckets = new Map<string, SearchableSettlement[]>();
  for (const settlement of settlements) {
    const key = settlement.resolution
      ? `resolution:${settlement.resolution.id}`
      : `pending:${isPrescriptionRisk(settlement.period, currentYear)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), settlement]);
  }

  return [...buckets.values()]
    .map((members) => {
      const sorted = [...members].sort((a, b) => a.period - b.period);
      const { resolution } = sorted[0];
      const statuses = new Set(sorted.map((s) => s.status));
      return {
        settlementId: sorted[0].id,
        resolutionNumber: resolution?.number ?? null,
        kind:
          resolution?.kind ??
          (isPrescriptionRisk(sorted[0].period, currentYear)
            ? ResolutionKind.PRESCRIPTION_RISK
            : ResolutionKind.NORMAL),
        periods: sorted.map((s) => s.period),
        status: statuses.size === 1 ? sorted[0].status : ('MIXED' as const),
        totalAmount:
          Math.round(sorted.reduce((sum, s) => sum + s.totalAmount, 0) * 100) /
          100,
        missingPeriods: sorted.filter(isMissingPeriod).map((s) => s.period),
      };
    })
    .sort((a, b) => a.periods[0] - b.periods[0]);
}
