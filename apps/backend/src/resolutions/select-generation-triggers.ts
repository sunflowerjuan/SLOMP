import { ResolutionKind } from '@prisma/client';
import { isPrescriptionRisk } from '../tax-roll/period-rules.js';

export interface PendingSettlement {
  id: number;
  propertyId: number;
  period: number;
}

export interface GenerationTrigger {
  id: number;
  propertyId: number;
  kind: ResolutionKind;
}

// Picks one settlement id per (property, kind) group out of a portfolio's
// pending settlements -- GenerateLiquidationPdfService.generateForSettlement
// already groups and generates the rest of that id's same-kind siblings on
// its own, so one trigger id is all each bulk Resolution needs.
export function selectGenerationTriggers(
  settlements: PendingSettlement[],
  currentYear: number,
): GenerationTrigger[] {
  const triggerByGroup = new Map<string, GenerationTrigger>();

  for (const settlement of settlements) {
    const kind = isPrescriptionRisk(settlement.period, currentYear)
      ? ResolutionKind.PRESCRIPTION_RISK
      : ResolutionKind.NORMAL;
    const groupKey = `${settlement.propertyId}:${kind}`;

    if (!triggerByGroup.has(groupKey)) {
      triggerByGroup.set(groupKey, {
        id: settlement.id,
        propertyId: settlement.propertyId,
        kind,
      });
    }
  }

  return [...triggerByGroup.values()];
}
