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
}

// One row per PDF the Administrator can generate: the periods of a property
// that share (or will share) a Resolution. Co-owned properties join every
// owner's name.
export interface SettlementSearchResult extends SettlementGroup {
  cadastralCode: string;
  address: string;
  ownerName: string;
}

// How many properties a single search returns (each with all its groups, so
// a group is never cut). There's no pagination yet (not asked for) — this
// just keeps a very broad search from returning the whole table.
const MAX_RESULTS = 100;

@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
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
    const properties = await this.prisma.property.findMany({
      where: {
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
          include: { resolution: true },
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
          resolution: settlement.resolution,
        })),
        currentYear,
      );
      return groups.map((group) => ({
        ...group,
        cadastralCode: property.cadastralCode,
        address: property.address,
        ownerName,
      }));
    });
  }

  // The Administrator can force any of the 4 states manually. The status
  // applies to the whole group the settlement belongs to (its Resolution, or
  // the periods that will form one), because that is the unit the panel and
  // the PDF show. Only a current settlement can be changed — one already
  // replaced isn't "the" settlement of its property+period anymore.
  async changeStatus(
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

    const settlement = await this.prisma.settlement.findUnique({
      where: { id },
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
            where: { resolutionId: settlement.resolutionId, replacedAt: null },
            select: { id: true },
          })
        : groupSettlementsForResolution(
            await this.prisma.settlement.findMany({
              where: {
                propertyId: settlement.propertyId,
                replacedAt: null,
                resolutionId: null,
              },
              select: { id: true, period: true },
            }),
            id,
            currentYearInColombia(),
          );
    const settlementIds = members.map((member) => member.id);

    await this.prisma.settlement.updateMany({
      where: { id: { in: settlementIds } },
      data: { status: status as SettlementStatus },
    });

    return {
      settlementId: id,
      settlementIds,
      status: status as SettlementStatus,
    };
  }
}
