import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { groupSettlementsForResolution } from '../resolutions/group-settlements-for-resolution.js';
import { currentYearInColombia } from '../tax-roll/period-rules.js';
import {
  groupSettlementsByResolution,
  type SettlementGroup,
} from './group-search-results.js';
import { allowedStatuses } from './settlement-status-rules.js';

export interface SettlementSearchCriteria {
  cadastralCode?: string;
  owner?: string;
  address?: string;
}

export interface SettlementStatusChangeResult {
  settlementId: number;
  // Every settlement of the group (resolution) that changed with it.
  settlementIds: number[];
  status: SettlementStatus;
  // What the selector may offer next, from the new state.
  allowedStatuses: SettlementStatus[];
  // Periods of the group still marked as missing after the change.
  missingPeriods: number[];
}

// One row per PDF the Administrator can generate: the periods of a property
// that share (or will share) a Resolution. Co-owned properties join every
// owner's name.
export interface SettlementSearchResult extends SettlementGroup {
  cadastralCode: string;
  address: string;
  ownerName: string;
  // States the status selector may offer for this group right now.
  allowedStatuses: SettlementStatus[];
}

// Earliest payment order (mandamiento) of each resolution, from its
// settlements' payment orders.
function firstPaymentOrderByResolution(
  settlements: {
    resolutionId: number | null;
    paymentOrder: { issuedAt: Date } | null;
  }[],
): Map<number, Date> {
  const first = new Map<number, Date>();
  for (const { resolutionId, paymentOrder } of settlements) {
    if (resolutionId === null || paymentOrder === null) continue;
    const current = first.get(resolutionId);
    if (!current || paymentOrder.issuedAt < current) {
      first.set(resolutionId, paymentOrder.issuedAt);
    }
  }
  return first;
}

// How many properties a single search returns (each with all its groups, so
// a group is never cut). There's no pagination yet (not asked for) — this
// just keeps a very broad search from returning the whole table.
const MAX_RESULTS = 100;

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    municipalityId: number,
    criteria: SettlementSearchCriteria,
  ): Promise<SettlementSearchResult[]> {
    const cadastralCode = criteria.cadastralCode?.trim();
    const owner = criteria.owner?.trim();
    const address = criteria.address?.trim();

    if (!cadastralCode && !owner && !address) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.SETTLEMENT_SEARCH_CRITERIA_REQUIRED,
          'Provide at least one of cadastralCode, owner or address.',
        ),
      );
    }

    const currentYear = currentYearInColombia();
    const now = new Date();
    const properties = await this.prisma.property.findMany({
      where: {
        municipalityId,
        // Only properties with a current settlement: one already replaced
        // (replacedAt set) is history, regardless of its payment status —
        // generating an official PDF from one wouldn't make sense.
        settlements: { some: { replacedAt: null } },
        ...(cadastralCode
          ? { cadastralCode: { contains: cadastralCode, mode: 'insensitive' } }
          : {}),
        ...(address
          ? { address: { contains: address, mode: 'insensitive' } }
          : {}),
        ...(owner
          ? {
              owners: {
                some: {
                  owner: { name: { contains: owner, mode: 'insensitive' } },
                },
              },
            }
          : {}),
      },
      include: {
        owners: { include: { owner: true } },
        settlements: {
          where: { replacedAt: null },
          include: {
            resolution: true,
            paymentOrder: { select: { issuedAt: true } },
          },
        },
      },
      orderBy: { cadastralCode: 'asc' },
      take: MAX_RESULTS,
    });

    return properties.flatMap((property) => {
      const ownerName = property.owners
        .map((propertyOwner) => propertyOwner.owner.name)
        .join(', ');
      const groups = groupSettlementsByResolution(
        property.settlements.map((settlement) => ({
          id: settlement.id,
          period: settlement.period,
          status: settlement.status,
          totalAmount: settlement.totalAmount.toNumber(),
          missingSince: settlement.missingSince,
          resolution: settlement.resolution,
        })),
        currentYear,
      );
      const firstPaymentOrders = firstPaymentOrderByResolution(
        property.settlements,
      );
      return groups.map((group) => {
        // The PATCH uses the clicked (first) settlement's state, so the
        // selector does too -- also for legacy MIXED groups.
        const trigger = property.settlements.find(
          (settlement) => settlement.id === group.settlementId,
        )!;
        return {
          ...group,
          cadastralCode: property.cadastralCode,
          address: property.address,
          ownerName,
          allowedStatuses: allowedStatuses({
            current: trigger.status,
            resolutionIssuedAt: trigger.resolution?.issuedAt ?? null,
            firstPaymentOrderAt:
              trigger.resolutionId === null
                ? null
                : (firstPaymentOrders.get(trigger.resolutionId) ?? null),
            now,
          }),
        };
      });
    });
  }

  // The status applies to the whole group the settlement belongs to (its
  // Resolution, or the periods that will form one), because that is the unit
  // the panel and the PDF show. Which states can be set depends on the
  // current one, the resolution's age and its payment order
  // (settlement-status-rules.ts). Only a current settlement can be changed —
  // one already replaced isn't "the" settlement of its property+period
  // anymore.
  async changeStatus(
    municipalityId: number,
    id: number,
    status: unknown,
  ): Promise<SettlementStatusChangeResult> {
    if (
      typeof status !== 'string' ||
      !Object.values(SettlementStatus).includes(status as SettlementStatus)
    ) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.SETTLEMENT_STATUS_INVALID,
          `"status" must be one of: ${Object.values(SettlementStatus).join(', ')}.`,
          { allowed: Object.values(SettlementStatus) },
        ),
      );
    }

    // A settlement of another municipality is "not found", same as one that
    // does not exist.
    const settlement = await this.prisma.settlement.findFirst({
      where: { id, property: { municipalityId } },
      include: { resolution: { select: { issuedAt: true } } },
    });
    if (!settlement) {
      throw new NotFoundException(
        errorBody(
          ErrorCode.SETTLEMENT_NOT_FOUND,
          `Settlement ${id} not found.`,
        ),
      );
    }
    if (settlement.replacedAt !== null) {
      throw new ConflictException(
        errorBody(
          ErrorCode.SETTLEMENT_ALREADY_REPLACED,
          'Cannot change the status of a settlement that was already replaced.',
        ),
      );
    }

    const members =
      settlement.resolutionId !== null
        ? await this.prisma.settlement.findMany({
            where: {
              resolutionId: settlement.resolutionId,
              replacedAt: null,
              property: { municipalityId },
            },
            select: { id: true },
          })
        : groupSettlementsForResolution(
            await this.prisma.settlement.findMany({
              where: {
                propertyId: settlement.propertyId,
                property: { municipalityId },
                replacedAt: null,
                resolutionId: null,
              },
              select: { id: true, period: true },
            }),
            id,
            currentYearInColombia(),
          );
    const settlementIds = members.map((member) => member.id);

    const firstPaymentOrder = await this.prisma.paymentOrder.findFirst({
      where: { settlementId: { in: settlementIds } },
      orderBy: { issuedAt: 'asc' },
      select: { issuedAt: true },
    });
    const context = {
      resolutionIssuedAt: settlement.resolution?.issuedAt ?? null,
      firstPaymentOrderAt: firstPaymentOrder?.issuedAt ?? null,
      now: new Date(),
    };
    const allowed = allowedStatuses({
      ...context,
      current: settlement.status,
    });
    if (!allowed.includes(status as SettlementStatus)) {
      throw new ConflictException(
        errorBody(
          ErrorCode.SETTLEMENT_STATUS_TRANSITION_NOT_ALLOWED,
          `Cannot change the status from ${settlement.status} to ${status}.`,
          { from: settlement.status, to: status, allowed },
        ),
      );
    }

    await this.prisma.settlement.updateMany({
      where: { id: { in: settlementIds }, property: { municipalityId } },
      data: { status: status as SettlementStatus },
    });

    // The whole group now shares one state, so the mark only survives a
    // change back to VIGENTE.
    const stillMissing =
      status === SettlementStatus.VIGENTE
        ? await this.prisma.settlement.findMany({
            where: {
              id: { in: settlementIds },
              property: { municipalityId },
              missingSince: { not: null },
            },
            select: { period: true },
            orderBy: { period: 'asc' },
          })
        : [];

    return {
      settlementId: id,
      settlementIds,
      status: status as SettlementStatus,
      allowedStatuses: allowedStatuses({
        ...context,
        current: status as SettlementStatus,
      }),
      missingPeriods: stillMissing.map((member) => member.period),
    };
  }
}
