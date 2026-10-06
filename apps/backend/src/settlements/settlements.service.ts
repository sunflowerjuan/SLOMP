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

export interface SettlementSearchCriteria {
  cadastralCode?: string;
  owner?: string;
  address?: string;
}

export interface SettlementStatusChangeResult {
  settlementId: number;
  status: SettlementStatus;
}

export interface SettlementSearchResult {
  settlementId: number;
  cadastralCode: string;
  address: string;
  // Co-owned properties join every owner's name — the panel shows one row
  // per settlement, not one per owner.
  ownerName: string;
  period: number;
  status: SettlementStatus;
  totalAmount: number;
}

// How many rows a single search returns. There's no pagination yet (not
// asked for) — this just keeps an unbounded/very broad search from
// returning the whole table.
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

    const settlements = await this.prisma.settlement.findMany({
      where: {
        // Only the current settlement of each property+period: one already
        // replaced (replacedAt set) is history, regardless of its payment
        // status — generating an official PDF from one wouldn't make sense.
        replacedAt: null,
        property: {
          ...(cadastralCode
            ? {
                cadastralCode: { contains: cadastralCode, mode: 'insensitive' },
              }
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
      },
      include: {
        property: {
          include: { owners: { include: { owner: true } } },
        },
      },
      orderBy: [{ property: { cadastralCode: 'asc' } }, { period: 'asc' }],
      take: MAX_RESULTS,
    });

    return settlements.map((settlement) => ({
      settlementId: settlement.id,
      cadastralCode: settlement.property.cadastralCode,
      address: settlement.property.address,
      ownerName: settlement.property.owners
        .map((propertyOwner) => propertyOwner.owner.name)
        .join(', '),
      period: settlement.period,
      status: settlement.status,
      totalAmount: settlement.totalAmount.toNumber(),
    }));
  }

  // The Administrator can force any of the 4 states manually. Only a
  // current settlement can be changed — one already replaced isn't "the"
  // settlement of its property+period anymore.
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

    const updated = await this.prisma.settlement.update({
      where: { id },
      data: { status: status as SettlementStatus },
    });

    return { settlementId: updated.id, status: updated.status };
  }
}
