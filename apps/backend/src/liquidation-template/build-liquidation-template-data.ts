import { NO_OWNER_NAME_PLACEHOLDER } from '../tax-roll/persist-tax-roll.js';
import type { LiquidationTemplateData } from './liquidation-template-data.js';

export interface SettlementDetailLike {
  concept: string;
  amount: number;
}

export interface SettlementWithDetailsLike {
  period: number;
  details: SettlementDetailLike[];
}

export interface PropertyOwnerLike {
  owner: { name: string };
}

export interface PropertyLike {
  cadastralCode: string;
  address: string;
  owners: PropertyOwnerLike[];
}

// The tax roll only ever creates these 3 capital concepts per settlement
// (persist-tax-roll.ts), each paired with its own "Interés X" detail row.
// The template shows the capital concepts uppercased, and relabels
// "C.A.R." as "SOBRETASA AMBIENTAL" per the business rules.
const CAPITAL_CONCEPTS: {
  concept: string;
  interestConcept: string;
  label: string;
}[] = [
  {
    concept: 'Impuesto Predial',
    interestConcept: 'Interés Impuesto Predial',
    label: 'IMPUESTO PREDIAL',
  },
  {
    concept: 'C.A.R.',
    interestConcept: 'Interés C.A.R.',
    label: 'SOBRETASA AMBIENTAL',
  },
  {
    concept: 'Sobretasa Bomberil',
    interestConcept: 'Interés Sobretasa Bomberil',
    label: 'SOBRETASA BOMBERIL',
  },
];

const moneyFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatMoney(amount: number): string {
  // Intl inserts a non-breaking space (U+00A0) between "$" and the digits;
  // normalize to a plain space so the output is predictable ASCII.
  return moneyFormatter.format(amount).replace(' ', ' ');
}

function detailAmount(
  details: SettlementDetailLike[],
  concept: string,
): number {
  return details.find((d) => d.concept === concept)?.amount ?? 0;
}

export function ownersOf(property: PropertyLike): string {
  return property.owners
    .map((po) => po.owner.name)
    .filter((name) => name !== NO_OWNER_NAME_PLACEHOLDER)
    .join(', ');
}

// Capital charged for one period: the sum of the 3 capital concepts, without
// their interest rows.
export function capitalOfSettlement(
  settlement: SettlementWithDetailsLike,
): number {
  return CAPITAL_CONCEPTS.reduce(
    (sum, { concept }) => sum + detailAmount(settlement.details, concept),
    0,
  );
}

export function buildLiquidationTemplateData(
  resolutionNumber: string,
  property: PropertyLike,
  settlements: SettlementWithDetailsLike[],
): LiquidationTemplateData {
  const periods = settlements.map((s) => s.period);

  const owners = ownersOf(property);

  let capitalTotal = 0;
  let interestTotal = 0;
  const rows: LiquidationTemplateData['rows'] = [];

  for (const settlement of [...settlements].sort(
    (a, b) => a.period - b.period,
  )) {
    for (const { concept, interestConcept, label } of CAPITAL_CONCEPTS) {
      const capital = detailAmount(settlement.details, concept);
      const interest = detailAmount(settlement.details, interestConcept);
      capitalTotal += capital;
      interestTotal += interest;

      // A capital concept that was never charged (0) doesn't get a row --
      // even if, oddly, its interest were nonzero.
      if (capital === 0) continue;

      rows.push({
        year: String(settlement.period),
        concept: label,
        interest: formatMoney(interest),
        capital: formatMoney(capital),
      });
    }
  }

  return {
    resolutionNumber,
    cadastralCode: property.cadastralCode,
    propertyName: property.address,
    owners,
    startYear: String(Math.min(...periods)),
    endYear: String(Math.max(...periods)),
    totalAmount: formatMoney(capitalTotal + interestTotal),
    capitalAmount: formatMoney(capitalTotal),
    interestAmount: formatMoney(interestTotal),
    rows,
  };
}

// Raw Decimal amounts from Prisma into the plain numbers
// buildLiquidationTemplateData works with.
export function toTemplateSettlements(
  settlements: {
    period: number;
    details: { concept: string; amount: { toNumber(): number } }[];
  }[],
): SettlementWithDetailsLike[] {
  return settlements.map((s) => ({
    period: s.period,
    details: s.details.map((d) => ({
      concept: d.concept,
      amount: d.amount.toNumber(),
    })),
  }));
}

// Stable keys (not prose) of the data a liquidation PDF can't be generated
// without, so the frontend can name each missing field. Empty when complete.
export function missingLiquidationData(
  property: PropertyLike,
  settlements: SettlementWithDetailsLike[],
): string[] {
  const missing: string[] = [];
  if (!property.cadastralCode?.trim()) missing.push('CADASTRAL_CODE');
  if (!property.address?.trim()) missing.push('PROPERTY_ADDRESS');
  if (settlements.length === 0) missing.push('SETTLEMENT_PERIODS');
  if (settlements.some((settlement) => settlement.details.length === 0)) {
    missing.push('SETTLEMENT_DETAILS');
  }
  if (
    settlements.some(
      (settlement) =>
        !Number.isInteger(settlement.period) ||
        settlement.details.some(
          (detail) =>
            !detail.concept?.trim() || !Number.isFinite(detail.amount),
        ),
    )
  ) {
    missing.push('SETTLEMENT_VALUES');
  }
  return missing;
}
