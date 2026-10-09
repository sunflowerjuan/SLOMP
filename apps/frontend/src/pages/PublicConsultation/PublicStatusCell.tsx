import type { PublicSettlement } from "../../api/publicConsultation";
import {
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_VARIANT,
} from "../../domain/settlementStatus";
import { StatusBadge } from "../../components/ui/StatusBadge";

export function PublicStatusCell({
  status,
}: {
  status: PublicSettlement["status"];
}) {
  return status === "MIXED" ? (
    <StatusBadge variant="neutral">Mixto</StatusBadge>
  ) : (
    <StatusBadge variant={SETTLEMENT_STATUS_VARIANT[status]}>
      {SETTLEMENT_STATUS_LABEL[status]}
    </StatusBadge>
  );
}
