import { BadRequestException, Injectable } from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PublicSettlementQueryCriteria {
  cadastralCode?: string;
  ownerName?: string;
  address?: string;
}

export interface PublicSettlementQueryResult {
  settlementId: number;
  cadastralCode: string;
  address: string;
  ownerName: string;
  period: string;
  totalAmount: number;
}

// RNF-04: this is an anonymous, public endpoint — it must never leak which
// part of a guess was right or suggest close matches. Every given field is
// matched with `equals` (never `contains`) and AND-ed together, so a query
// either identifies one real predio or returns nothing at all.
@Injectable()
export class PublicSettlementQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async query(
    criteria: PublicSettlementQueryCriteria,
  ): Promise<PublicSettlementQueryResult[]> {
    const cadastralCode = criteria.cadastralCode?.trim();
    const ownerName = criteria.ownerName?.trim();
    const address = criteria.address?.trim();

    // RF-15: the citizen must corroborate at least 2 of the 3 identifying
    // facts about the predio — a single field is not enough to prove they
    // are entitled to see its settlements.
    const providedCount = [cadastralCode, ownerName, address].filter(
      (value) => !!value,
    ).length;
    if (providedCount < 2) {
      throw new BadRequestException(
        'Provide at least 2 of: cadastralCode, ownerName, address.',
      );
    }

    const settlements = await this.prisma.settlement.findMany({
      where: {
        status: SettlementStatus.ACTIVE,
        property: {
          ...(cadastralCode
            ? { cadastralCode: { equals: cadastralCode, mode: 'insensitive' } }
            : {}),
          ...(address
            ? { address: { equals: address, mode: 'insensitive' } }
            : {}),
          ...(ownerName
            ? {
                owners: {
                  some: {
                    owner: { name: { equals: ownerName, mode: 'insensitive' } },
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
      orderBy: { period: 'asc' },
    });

    return settlements.map((settlement) => ({
      settlementId: settlement.id,
      cadastralCode: settlement.property.cadastralCode,
      address: settlement.property.address,
      ownerName: settlement.property.owners
        .map((propertyOwner) => propertyOwner.owner.name)
        .join(', '),
      period: settlement.period,
      totalAmount: settlement.totalAmount.toNumber(),
    }));
  }
}
