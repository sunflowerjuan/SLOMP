// The 4 real states of a settlement. "Inactiva" doesn't exist -- a
// replaced settlement doesn't change state, see
// packages/shared/prisma/schema.prisma. Shared between the admin panel
// (Liquidaciones) and the public consultation: both show the same state,
// only who can change it differs.
export type SettlementStatus =
  "VIGENTE" | "PAGADA" | "ACUERDO_DE_PAGO" | "PRESCRITA";

export const SETTLEMENT_STATUSES: SettlementStatus[] = [
  "VIGENTE",
  "PAGADA",
  "ACUERDO_DE_PAGO",
  "PRESCRITA",
];

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  VIGENTE: "Vigente",
  PAGADA: "Pagada",
  ACUERDO_DE_PAGO: "Acuerdo de pago",
  PRESCRITA: "Prescrita",
};

export const SETTLEMENT_STATUS_VARIANT: Record<
  SettlementStatus,
  "success" | "warning" | "danger" | "neutral"
> = {
  VIGENTE: "warning",
  PAGADA: "success",
  ACUERDO_DE_PAGO: "neutral",
  PRESCRITA: "danger",
};
