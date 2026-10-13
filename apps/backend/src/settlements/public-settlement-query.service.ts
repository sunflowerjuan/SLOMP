import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { currentYearInColombia } from '../tax-roll/period-rules.js';
import {
  groupSettlementsByResolution,
  type SettlementGroup,
} from './group-search-results.js';

export interface PublicSettlementQueryCriteria {
  cadastralCode?: string;
  ownerName?: string;
  address?: string;
}

// One row per PDF (a Resolution, or the one it will become), the same
// grouping the Administrator sees. `settlementId` is the earliest period of
// the group and works as the trigger for its PDF.
export interface PublicSettlementQueryResult extends SettlementGroup {
  cadastralCode: string;
  address: string;
  ownerName: string;
}

export interface PublicMunicipalityInfo {
  id: number;
  slug: string;
  name: string;
}

// This is an anonymous, public endpoint — it must never leak which part of
// a guess was right or suggest close matches. Every given field is matched
// with `equals` (never `contains`) and AND-ed together, so a query either
// identifies one real predio or returns nothing at all.
@Injectable()
export class PublicSettlementQueryService {
  constructor(private readonly prisma: PrismaService) {}

  // Public identity of a municipality: only what its own iframe may show.
  // `null` for an unknown slug -- callers must answer it like "no results".
  async findPublicMunicipality(
    slug: string,
  ): Promise<PublicMunicipalityInfo | null> {
    return this.prisma.municipality.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });
  }

  // Entry point of POST /consulta-publica/:slug. An unknown slug answers
  // exactly like a known one with no match (an empty list), so the route can
  // not be used to discover which municipalities exist. The criteria are
  // validated first so a bad request fails the same way for any slug.
  async queryBySlug(
    slug: string,
    criteria: PublicSettlementQueryCriteria,
  ): Promise<PublicSettlementQueryResult[]> {
    const normalized = this.normalizeCriteria(criteria);
    const municipality = await this.findPublicMunicipality(slug);
    if (!municipality) return [];
    return this.query(municipality.id, normalized);
  }

  async query(
    municipalityId: number,
    criteria: PublicSettlementQueryCriteria,
  ): Promise<PublicSettlementQueryResult[]> {
    const { cadastralCode, ownerName, address } =
      this.normalizeCriteria(criteria);

    const settlements = await this.prisma.settlement.findMany({
      where: {
        // The current settlement of each property+period, regardless of its
        // payment status — a citizen must be able to see a pagada/acuerdo de
        // pago/prescrita settlement too, not just ones literally VIGENTE.
        replacedAt: null,
        property: {
          // The one rule that keeps each municipality's iframe to its own
          // data: every public lookup is pinned to a municipality id.
          municipalityId,
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
        resolution: true,
        property: {
          include: { owners: { include: { owner: true } } },
        },
      },
      orderBy: { period: 'asc' },
    });

    const byProperty = new Map<number, typeof settlements>();
    for (const settlement of settlements) {
      byProperty.set(settlement.propertyId, [
        ...(byProperty.get(settlement.propertyId) ?? []),
        settlement,
      ]);
    }

    const currentYear = currentYearInColombia();
    return [...byProperty.values()].flatMap((members) => {
      const { property } = members[0];
      const ownerName = property.owners
        .map((propertyOwner) => propertyOwner.owner.name)
        .join(', ');
      return groupSettlementsByResolution(
        members.map((settlement) => ({
          id: settlement.id,
          period: settlement.period,
          status: settlement.status,
          totalAmount: settlement.totalAmount.toNumber(),
          resolution: settlement.resolution,
        })),
        currentYear,
      ).map((group) => ({
        ...group,
        cadastralCode: property.cadastralCode,
        address: property.address,
        ownerName,
      }));
    });
  }

  private normalizeCriteria(
    criteria: PublicSettlementQueryCriteria,
  ): PublicSettlementQueryCriteria {
    const cadastralCode = criteria.cadastralCode?.trim();
    const ownerName = criteria.ownerName?.trim();
    const address = criteria.address?.trim();

    // The citizen must corroborate at least 2 of the 3 identifying facts
    // about the predio — a single field is not enough to prove they are
    // entitled to see its settlements.
    const providedCount = [cadastralCode, ownerName, address].filter(
      (value) => !!value,
    ).length;
    if (providedCount < 2) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.PUBLIC_QUERY_CRITERIA_REQUIRED,
          'Provide at least 2 of: cadastralCode, ownerName, address.',
        ),
      );
    }
    return { cadastralCode, ownerName, address };
  }
}
