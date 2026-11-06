import { isPrescriptionRisk } from '../tax-roll/period-rules.js';

export interface GroupableSettlement {
  id: number;
  period: number;
}

// A property with settlements in both ranges needs two separate Resolutions
// (one per kind): given the full set of a property's current, ungrouped
// settlements and the one the caller clicked, this returns just its
// same-kind siblings -- the group that one generation call covers. Sorted by
// period ascending, which is also the order the template table lists rows in.
export function groupSettlementsForResolution<T extends GroupableSettlement>(
  settlements: T[],
  triggerSettlementId: number,
  currentYear: number,
): T[] {
  const trigger = settlements.find((s) => s.id === triggerSettlementId);
  if (!trigger) {
    throw new Error(
      `Settlement ${triggerSettlementId} is not in the given settlement list.`,
    );
  }

  const triggerIsPrescriptionRisk = isPrescriptionRisk(
    trigger.period,
    currentYear,
  );

  return settlements
    .filter(
      (s) =>
        isPrescriptionRisk(s.period, currentYear) === triggerIsPrescriptionRisk,
    )
    .sort((a, b) => a.period - b.period);
}
