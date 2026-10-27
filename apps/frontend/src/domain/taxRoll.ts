import type { TaxRollConflict } from "../api/taxRoll";
import { formatCount } from "../utils/formatCount";

// How the panel reads a tax roll upload result. Pure.

// Property+period pairs as the Administrator counts them: "12 periodos de 5
// predios".
function periodsOfProperties(pairs: TaxRollConflict[]): string {
  const properties = new Set(pairs.map((pair) => pair.cadastralCode)).size;
  return `${formatCount(pairs.length, "periodo", "periodos")} de ${formatCount(properties, "predio", "predios")}`;
}

// The pairs that already had a current liquidation and were left as they were
// (they can still be replaced).
export function conflictNotice(pairs: TaxRollConflict[]): string {
  return pairs.length === 1
    ? `${periodsOfProperties(pairs)} ya tenía una liquidación y no se modificó.`
    : `${periodsOfProperties(pairs)} ya tenían una liquidación y no se modificaron.`;
}

// The pairs whose liquidation is "En firme": a tax roll never replaces them.
export function lockedNotice(pairs: TaxRollConflict[]): string {
  return pairs.length === 1
    ? `${periodsOfProperties(pairs)} tiene su liquidación en firme y no se reemplazó.`
    : `${periodsOfProperties(pairs)} tienen su liquidación en firme y no se reemplazaron.`;
}
