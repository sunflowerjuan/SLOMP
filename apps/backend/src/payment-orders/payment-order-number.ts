import { formatResolutionNumber } from '../resolutions/reserve-resolution-number.js';

export interface PaymentOrderCounterClient {
  paymentOrderCounter: {
    upsert(args: {
      where: { municipalityId_year: { municipalityId: number; year: number } };
      create: { municipalityId: number; year: number; lastSequence: number };
      update: { lastSequence: { increment: number } };
      select: { lastSequence: true };
    }): Promise<{ lastSequence: number }>;
  };
}

export interface ReservedPaymentOrderNumber {
  year: number;
  sequence: number;
  number: string;
}

// Same <year>-<sequence> shape as the resolution number; the official
// template prints any fixed prefix.
export function formatPaymentOrderNumber(
  year: number,
  sequence: number,
): string {
  return formatResolutionNumber(year, sequence);
}

// Reserves `count` consecutive numbers for a municipality and year with one
// atomic upsert (INSERT ... ON CONFLICT DO UPDATE), so two concurrent
// requests never get the same number. Works inside a transaction, to reserve
// the numbers together with the payment orders that use them.
export async function reservePaymentOrderNumbers(
  client: PaymentOrderCounterClient,
  municipalityId: number,
  year: number,
  count: number,
): Promise<ReservedPaymentOrderNumber[]> {
  if (!Number.isInteger(year) || year <= 0) {
    throw new Error('Year must be a positive integer.');
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('Count must be a positive integer.');
  }

  const { lastSequence } = await client.paymentOrderCounter.upsert({
    where: { municipalityId_year: { municipalityId, year } },
    create: { municipalityId, year, lastSequence: count },
    update: { lastSequence: { increment: count } },
    select: { lastSequence: true },
  });

  const firstSequence = lastSequence - count + 1;
  return Array.from({ length: count }, (_, index) => {
    const sequence = firstSequence + index;
    return { year, sequence, number: formatPaymentOrderNumber(year, sequence) };
  });
}
