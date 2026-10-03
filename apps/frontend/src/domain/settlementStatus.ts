// Los 4 estados reales de una liquidacion. "Inactiva" no existe -- una
// liquidacion reemplazada no cambia de estado, ver
// packages/shared/prisma/schema.prisma. Compartido entre el panel admin
// (Liquidaciones) y la consulta publica: ambos muestran el mismo estado,
// solo cambia quien puede modificarlo.
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
