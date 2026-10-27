// Figures as the panel shows them: the Colombian thousands separator
// ("11.202") and, for a count, its noun in singular or plural ("1 predio",
// "12 predios"). Not for years or row numbers, which read as written.
const NUMBER = new Intl.NumberFormat("es-CO");

export function formatNumber(value: number): string {
  return NUMBER.format(value);
}

// The noun that goes with a count: the singular only for exactly one.
export function countNoun(
  count: number,
  singular: string,
  plural: string,
): string {
  return count === 1 ? singular : plural;
}

// 1 -> "1 predio"; 1004 -> "1.004 predios".
export function formatCount(
  count: number,
  singular: string,
  plural: string,
): string {
  return `${formatNumber(count)} ${countNoun(count, singular, plural)}`;
}
