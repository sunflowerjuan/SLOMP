// Whole pesos without decimals ($ 1.284.500); with cents, always two
// ($ 1.376.200,50): never a single decimal, which reads as a cut-off amount.
const WHOLE = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const WITH_CENTS = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCop(amount: number): string {
  if (!Number.isFinite(amount)) return String(amount);
  return Number.isInteger(amount)
    ? WHOLE.format(amount)
    : WITH_CENTS.format(amount);
}
