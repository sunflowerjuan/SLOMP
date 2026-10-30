import { Prisma, SettlementStatus } from '@prisma/client';
import { allowedStatuses } from '../settlements/settlement-status-rules.js';

// What Slompsim reads about a settlement. Only what the tools and the
// panel's proposal cards need: never owner names, documents or addresses,
// since all of it can reach the model's provider.
export interface AssistantSettlement {
  id: number;
  cadastralCode: string;
  period: number;
  status: SettlementStatus;
  allowedStatuses: SettlementStatus[];
  hasPaymentOrder: boolean;
}

// The columns every assistant query reads: the property's code, and the
// dates the status rules need.
export const ASSISTANT_SETTLEMENT_SELECT = {
  id: true,
  period: true,
  status: true,
  replacedAt: true,
  property: { select: { cadastralCode: true } },
  resolution: { select: { issuedAt: true } },
  paymentOrder: { select: { number: true, issuedAt: true } },
} satisfies Prisma.SettlementSelect;

export type AssistantSettlementRow = Prisma.SettlementGetPayload<{
  select: typeof ASSISTANT_SETTLEMENT_SELECT;
}>;

export function allowedStatusesOf(
  row: AssistantSettlementRow,
  now: Date,
): SettlementStatus[] {
  return allowedStatuses({
    current: row.status,
    resolutionIssuedAt: row.resolution?.issuedAt ?? null,
    paymentOrderAt: row.paymentOrder?.issuedAt ?? null,
    now,
  });
}

export function toAssistantSettlement(
  row: AssistantSettlementRow,
  now: Date,
): AssistantSettlement {
  return {
    id: row.id,
    cadastralCode: row.property.cadastralCode,
    period: row.period,
    status: row.status,
    allowedStatuses: allowedStatusesOf(row, now),
    hasPaymentOrder: row.paymentOrder !== null,
  };
}
