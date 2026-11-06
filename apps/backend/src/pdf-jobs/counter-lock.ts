import { Prisma } from '@prisma/client';

// Resolutions and payment orders each have their own consecutive counter.
export type CounterKind = 'resolution' | 'paymentOrder';

const COUNTER_TABLES: Record<CounterKind, Prisma.Sql> = {
  resolution: Prisma.raw('"resolution_counters"'),
  paymentOrder: Prisma.raw('"payment_order_counters"'),
};

// Locks the consecutive counter of a municipality and year for the rest of
// the transaction and returns its current value. Creating a bulk job,
// reverting one and the individual generation of the panel all take this
// lock, so they never interleave and a failed job can hand its range back
// without leaving gaps (Confluence SL-118, section 6).
export async function lockCounter(
  tx: Prisma.TransactionClient,
  municipalityId: number,
  year: number,
  kind: CounterKind = 'resolution',
): Promise<number> {
  const table = COUNTER_TABLES[kind];
  await tx.$executeRaw`
    INSERT INTO ${table} ("municipalityId", "year", "lastSequence")
    VALUES (${municipalityId}, ${year}, 0)
    ON CONFLICT ("municipalityId", "year") DO NOTHING`;
  const [row] = await tx.$queryRaw<{ lastSequence: number }[]>`
    SELECT "lastSequence" FROM ${table}
    WHERE "municipalityId" = ${municipalityId} AND "year" = ${year}
    FOR UPDATE`;
  return row!.lastSequence;
}
