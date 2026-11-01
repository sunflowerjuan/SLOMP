import {
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_VARIANT,
} from "../../domain/settlementStatus";
import type { SettlementStatus } from "../../domain/settlementStatus";
import { StatusBadge } from "./StatusBadge";

interface SettlementStatusBadgeProps {
  // "MIXED": a group of periods in different states.
  status: SettlementStatus | "MIXED";
}

export function SettlementStatusBadge({ status }: SettlementStatusBadgeProps) {
  return status === "MIXED" ? (
    <StatusBadge variant="neutral">Varios estados</StatusBadge>
  ) : (
    <StatusBadge variant={SETTLEMENT_STATUS_VARIANT[status]}>
      {SETTLEMENT_STATUS_LABEL[status]}
    </StatusBadge>
  );
}
