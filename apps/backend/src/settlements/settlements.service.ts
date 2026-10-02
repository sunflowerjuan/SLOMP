import { BadRequestException, Injectable } from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface SettlementSearchCriteria {
  cadastralCode?: string;
  owner?: string;
  address?: string;
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
        'Provide at least one of cadastralCode, owner or address.',
      );
    }

    const settlements = await this.prisma.settlement.findMany({
      where: {
        // Only vigentes: an INACTIVE settlement was already replaced (HU18),
        // generating an official PDF from one wouldn't make sense.
        status: SettlementStatus.ACTIVE,
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
}
