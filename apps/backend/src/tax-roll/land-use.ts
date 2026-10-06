// Mirrors the `LandUse` enum in packages/shared/prisma/schema.prisma. Kept as a
// plain constant so the parser stays free of Prisma and can be unit-tested
// without a database; persist-tax-roll.ts fails to type-check if they drift.
export const LandUse = {
  RURAL: 'RURAL',
  URBAN: 'URBAN',
} as const;

export type LandUse = (typeof LandUse)[keyof typeof LandUse];

// Values seen in the "Destino" column of the municipality's tax roll, already
// passed through `normalizeKey`. Extend this map (never the enum) when the
// client confirms a new spelling for an existing land use.
const LAND_USE_BY_SOURCE_VALUE: Record<string, LandUse> = {
  rural: LandUse.RURAL,
  urbano: LandUse.URBAN,
};

// Case, surrounding whitespace and accents are formatting noise in a
// hand-edited spreadsheet, not a different land use.
function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

// Returns null when the value is blank or not a known land use; the caller
// decides how to report it. Never falls back to free text.
export function parseLandUse(value: string): LandUse | null {
  return LAND_USE_BY_SOURCE_VALUE[normalizeKey(value)] ?? null;
}
