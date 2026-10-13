// The states of a settlement. "Inactiva" doesn't exist -- a replaced
// settlement doesn't change state, see packages/shared/prisma/schema.prisma.
// EN_FIRME is set by the backend 60 days after the resolution is issued.
// PRESCRITA keeps its backend name but is shown as "Pérdida temporal de
// competencia". Shared between the admin panel (Liquidaciones) and the public
// consultation: both show the same state, only who can change it differs.
export type SettlementStatus =
  "VIGENTE" | "EN_FIRME" | "PAGADA" | "ACUERDO_DE_PAGO" | "PRESCRITA";

export const SETTLEMENT_STATUSES: SettlementStatus[] = [
  "VIGENTE",
  "EN_FIRME",
  "PAGADA",
  "ACUERDO_DE_PAGO",
  "PRESCRITA",
];

export const SETTLEMENT_STATUS_LABEL: Record<SettlementStatus, string> = {
  VIGENTE: "Vigente",
  EN_FIRME: "En firme",
  PAGADA: "Pagada",
  ACUERDO_DE_PAGO: "Acuerdo de pago",
  PRESCRITA: "Pérdida temporal de competencia",
};

export const SETTLEMENT_STATUS_VARIANT: Record<
  SettlementStatus,
  "success" | "warning" | "danger" | "neutral" | "info"
> = {
  VIGENTE: "warning",
  EN_FIRME: "info",
  PAGADA: "success",
  ACUERDO_DE_PAGO: "neutral",
  PRESCRITA: "danger",
};
