// Domain rules for the tax roll "periodo" (a calendar year, see the
// Settlement.period decision in SL-77). They are pure functions: the current
// year is always injected so tests never depend on the system clock.

// The municipal property tax (impuesto predial) in its current form starts in
// 1980; no valid debt can be older than that.
export const PROPERTY_TAX_START_YEAR = 1980;

// A period is at prescription risk once it is this many years old or more.
export const PRESCRIPTION_YEARS = 5;

// Valid periods go from PROPERTY_TAX_START_YEAR up to the current year, both
// inclusive. A future period cannot be owed yet.
export function isValidPeriod(period: number, currentYear: number): boolean {
  return (
    Number.isInteger(period) &&
    period >= PROPERTY_TAX_START_YEAR &&
    period <= currentYear
  );
}

// True when the period is old enough to be at risk of prescription
// (period <= currentYear - 5; in 2026 that means 2021 and earlier).
export function isPrescriptionRisk(
  period: number,
  currentYear: number,
): boolean {
  return period <= currentYear - PRESCRIPTION_YEARS;
}

// The servers may run in UTC; the year that matters is the one in Colombia,
// otherwise a file uploaded on Dec 31 after 19:00 would see the next year.
export function currentYearInColombia(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
    }).format(now),
  );
}
