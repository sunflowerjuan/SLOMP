import { SettlementStatus } from '@prisma/client';
import {
  allowedStatusesOf,
  type AssistantSettlementRow,
} from './assistant-settlement.js';

export interface StatusChangeRequest {
  settlementId: number;
  toStatus: SettlementStatus;
}

export type StatusChangeRejectionReason =
  'TRANSITION_NOT_ALLOWED' | 'NOT_FOUND' | 'REPLACED';

// Which period a change is about, for the panel's proposal cards.
interface StatusChangeSubject {
  cadastralCode: string;
  period: number;
  resolutionNumber: string | null;
}

export interface AcceptedStatusChange extends StatusChangeSubject {
  settlementId: number;
  from: SettlementStatus;
  to: SettlementStatus;
}

export interface RejectedStatusChange extends Partial<StatusChangeSubject> {
  settlementId: number;
  to: SettlementStatus;
  reason: StatusChangeRejectionReason;
  // States it may move to now; empty when it can't be changed at all.
  allowed: SettlementStatus[];
  // For the panel to explain the rejection (section 6 of "Diseño de
  // Slompsim"). Absent for NOT_FOUND, like the subject.
  current?: SettlementStatus;
  paymentOrder?: { number: string; issuedAt: Date };
}

export interface StatusChangeReview {
  // A change to the state it already has is accepted (from === to); it
  // changes nothing when applied.
  accepted: AcceptedStatusChange[];
  rejected: RejectedStatusChange[];
}

function subjectOf(row: AssistantSettlementRow): StatusChangeSubject {
  return {
    cadastralCode: row.property.cadastralCode,
    period: row.period,
    resolutionNumber: row.resolution?.number ?? null,
  };
}

// Checks each requested change against the domain rules, in request order.
// `rows` are the settlements found for the request in the active
// municipality: an id missing from them (it doesn't exist, or belongs to
// another municipality) is NOT_FOUND.
export function reviewStatusChanges(
  rows: AssistantSettlementRow[],
  changes: StatusChangeRequest[],
  now: Date,
): StatusChangeReview {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const review: StatusChangeReview = { accepted: [], rejected: [] };
  for (const { settlementId, toStatus } of changes) {
    const row = byId.get(settlementId);
    if (!row) {
      review.rejected.push({
        settlementId,
        to: toStatus,
        reason: 'NOT_FOUND',
        allowed: [],
      });
      continue;
    }
    const explained = {
      ...subjectOf(row),
      to: toStatus,
      current: row.status,
      ...(row.paymentOrder && {
        paymentOrder: {
          number: row.paymentOrder.number,
          issuedAt: row.paymentOrder.issuedAt,
        },
      }),
    };
    if (row.replacedAt !== null) {
      review.rejected.push({
        settlementId,
        reason: 'REPLACED',
        allowed: [],
        ...explained,
      });
      continue;
    }
    const allowed = allowedStatusesOf(row, now);
    if (!allowed.includes(toStatus)) {
      review.rejected.push({
        settlementId,
        reason: 'TRANSITION_NOT_ALLOWED',
        allowed,
        ...explained,
      });
      continue;
    }
    review.accepted.push({
      settlementId,
      ...subjectOf(row),
      from: row.status,
      to: toStatus,
    });
  }
  return review;
}
