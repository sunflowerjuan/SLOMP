import {
  capitalOfSettlement,
  formatMoney,
  missingLiquidationData,
  ownersOf,
  toTemplateSettlements,
  type PropertyLike,
  type SettlementWithDetailsLike,
} from '../liquidation-template/build-liquidation-template-data.js';
import type { PaymentOrderTemplateData } from './payment-order-template-data.js';

export interface PaymentOrderSettlementLike extends SettlementWithDetailsLike {
  /** Number of the liquidation (resolution) the period belongs to. */
  resolutionNumber: string;
}

// "a, b y c": the last separator is "y", the last item has none.
function liquidationsOf(settlements: PaymentOrderSettlementLike[]) {
  const numbers = [
    ...new Set(settlements.map((s) => s.resolutionNumber)),
  ].sort();
  return numbers.map((number, index) => ({
    number,
    separator:
      index === numbers.length - 1
        ? ''
        : index === numbers.length - 2
          ? ' y '
          : ', ',
  }));
}

const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function buildPaymentOrderTemplateData(
  paymentOrderNumber: string,
  issuedAt: Date,
  property: PropertyLike,
  settlements: PaymentOrderSettlementLike[],
): PaymentOrderTemplateData {
  const periods = settlements.map((s) => s.period);
  return {
    paymentOrderNumber,
    issueDate: dateFormatter.format(issuedAt),
    cadastralCode: property.cadastralCode,
    propertyName: property.address,
    owners: ownersOf(property),
    startYear: String(Math.min(...periods)),
    endYear: String(Math.max(...periods)),
    capitalAmount: formatMoney(
      settlements.reduce((sum, s) => sum + capitalOfSettlement(s), 0),
    ),
    liquidations: liquidationsOf(settlements),
  };
}

// Stable keys of the data a payment order PDF can't be generated without: the
// same property and period data as a liquidation, plus the number of the
// liquidation each period belongs to. Empty when complete.
export function missingPaymentOrderData(
  property: PropertyLike,
  settlements: PaymentOrderSettlementLike[],
): string[] {
  const missing = missingLiquidationData(property, settlements);
  if (settlements.some((s) => !s.resolutionNumber)) {
    missing.push('LIQUIDATION_NUMBER');
  }
  return missing;
}

// The settlements of an issued payment order (with their details and
// resolution) in the shape the template data is built from.
export function templateSettlementsOf(
  settlements: {
    period: number;
    details: { concept: string; amount: { toNumber(): number } }[];
    resolution: { number: string } | null;
  }[],
): PaymentOrderSettlementLike[] {
  return toTemplateSettlements(settlements).map((settlement, i) => ({
    ...settlement,
    resolutionNumber: settlements[i]!.resolution?.number ?? '',
  }));
}
