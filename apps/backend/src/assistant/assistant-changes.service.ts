import { ConflictException, Injectable } from '@nestjs/common';
import {
  Prisma,
  SettlementEventSource,
  SettlementEventType,
} from '@prisma/client';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ASSISTANT_SETTLEMENT_SELECT } from './assistant-settlement.js';
import { assertChanges } from './assistant-tools.service.js';
import {
  reviewStatusChanges,
  type AcceptedStatusChange,
  type RejectedStatusChange,
  type StatusChangeRequest,
} from './review-status-changes.js';

export interface ConfirmStatusChangesResult {
  // Changes applied, each with its audit event.
  applied: AcceptedStatusChange[];
  // Settlements that already had the requested state: nothing to do.
  unchanged: number[];
}

function rejectedConflict(rejected: RejectedStatusChange[]): ConflictException {
  return new ConflictException(
    errorBody(
      ErrorCode.ASSISTANT_CHANGES_REJECTED,
      'No change was applied: some settlements no longer allow the requested change.',
      { rejected },
    ),
  );
}

// Applies a Slompsim proposal once the Administrator confirms it in the
// panel. The request carries the exact list of the proposal, never text from
// the model, and goes straight to HTTP (not through the model).
@Injectable()
export class AssistantChangesService {
  constructor(private readonly prisma: PrismaService) {}

  // All or nothing: every change is checked again here, with
  // the rows locked, and if any no longer applies none is applied (409 with
  // the rejected ones). Only the listed settlements change, never the rest
  // of their resolutions. Each applied change records an ASSISTANT
  // event with the Administrator who confirmed it.
  async confirm(
    municipalityId: number,
    administratorId: number,
    changes: StatusChangeRequest[],
    note?: string,
    now: Date = new Date(),
  ): Promise<ConfirmStatusChangesResult> {
    assertChanges(changes);
    const ids = changes.map((change) => change.settlementId);
    const trimmedNote = note?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      // Holds a concurrent change of these settlements (the panel's
      // selector, the EN_FIRME sweep, a payment order being issued) until
      // this one commits, so what is checked below is what gets written.
      await tx.$queryRaw`
        SELECT s."id" FROM "settlements" s
        JOIN "properties" p ON p."id" = s."propertyId"
        WHERE s."id" IN (${Prisma.join(ids)})
          AND p."municipalityId" = ${municipalityId}
        FOR UPDATE OF s`;
      const rows = await tx.settlement.findMany({
        where: { id: { in: ids }, property: { municipalityId } },
        select: ASSISTANT_SETTLEMENT_SELECT,
      });
      const review = reviewStatusChanges(rows, changes, now);
      if (review.rejected.length > 0) {
        throw rejectedConflict(review.rejected);
      }

      const applied = review.accepted.filter(({ from, to }) => from !== to);
      for (const { settlementId, from, to } of applied) {
        const claimed = await tx.settlement.updateMany({
          where: { id: settlementId, status: from, replacedAt: null },
          data: { status: to },
        });
        // Can't happen with the rows locked; kept so a missed lock fails
        // loudly instead of writing an unchecked transition.
        if (claimed.count === 0) {
          throw rejectedConflict([
            { settlementId, reason: 'TRANSITION_NOT_ALLOWED', allowed: [] },
          ]);
        }
      }
      if (applied.length > 0) {
        await tx.settlementEvent.createMany({
          data: applied.map(({ settlementId, from, to }) => ({
            settlementId,
            municipalityId,
            type: SettlementEventType.STATUS_CHANGED,
            fromStatus: from,
            toStatus: to,
            source: SettlementEventSource.ASSISTANT,
            note: trimmedNote,
            administratorId,
          })),
        });
      }

      return {
        applied,
        unchanged: review.accepted
          .filter(({ from, to }) => from === to)
          .map(({ settlementId }) => settlementId),
      };
    });
  }
}
