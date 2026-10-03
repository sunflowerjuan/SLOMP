export interface ResolutionCounterClient {
  resolutionCounter: {
    upsert(args: {
      where: { year: number };
      create: { year: number; lastSequence: number };
      update: { lastSequence: { increment: number } };
      select: { lastSequence: true };
    }): Promise<{ lastSequence: number }>;
  };
}

export function formatResolutionNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year <= 0) {
    throw new Error('Year must be a positive integer.');
  }
  if (!Number.isInteger(sequence) || sequence <= 0) {
    throw new Error('Sequence must be a positive integer.');
  }

  return `${year}-${String(sequence).padStart(4, '0')}`;
}

export async function reserveResolutionNumber(
  client: ResolutionCounterClient,
  year: number,
): Promise<{ year: number; sequence: number; number: string }> {
  if (!Number.isInteger(year) || year <= 0) {
    throw new Error('Year must be a positive integer.');
  }

  const { lastSequence } = await client.resolutionCounter.upsert({
    where: { year },
    create: { year, lastSequence: 1 },
    update: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  });

  return {
    year,
    sequence: lastSequence,
    number: formatResolutionNumber(year, lastSequence),
  };
}
