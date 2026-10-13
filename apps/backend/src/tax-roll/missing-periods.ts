// Comparison between two tax roll imports (SL-136, asked by the client on
// 13/10/2026). Pure functions: no Prisma, no clock.

export interface CurrentPeriod {
  id: number;
  propertyId: number;
  period: number;
}

export interface IncomingPeriod {
  propertyId: number;
  period: number;
}

// Current settlements whose period the new import does not bring any more,
// e.g. a property that had 2010-2021 and now comes without 2015.
//
// Only properties present in the new import are compared: a property that
// does not come at all is not reported (a file may be a partial tax roll).
// PENDING with the client: whether a property that disappears entirely
// should be marked too.
export function findMissingPeriods(
  current: CurrentPeriod[],
  incoming: IncomingPeriod[],
): CurrentPeriod[] {
  const incomingProperties = new Set(incoming.map((row) => row.propertyId));
  const incomingKeys = new Set(
    incoming.map((row) => `${row.propertyId}:${row.period}`),
  );
  return current.filter(
    (settlement) =>
      incomingProperties.has(settlement.propertyId) &&
      !incomingKeys.has(`${settlement.propertyId}:${settlement.period}`),
  );
}
