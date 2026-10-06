import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ResolutionKind } from '@prisma/client';
import {
  buildLiquidationTemplateData,
  type PropertyLike,
  type SettlementWithDetailsLike,
} from '../liquidation-template/build-liquidation-template-data.js';
import {
  convertDocxToPdf,
  PdfConversionError,
} from '../liquidation-template/convert-docx-to-pdf.js';
import {
  LiquidationTemplateError,
  renderLiquidationDocx,
} from '../liquidation-template/render-liquidation-docx.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  currentYearInColombia,
  isPrescriptionRisk,
} from '../tax-roll/period-rules.js';
import { groupSettlementsForResolution } from './group-settlements-for-resolution.js';
import { reserveResolutionNumber } from './reserve-resolution-number.js';

export interface GeneratedLiquidationPdf {
  pdf: Buffer;
  resolutionNumber: string;
}

// Raw Decimal amounts from Prisma into the plain numbers
// buildLiquidationTemplateData works with.
function toTemplateSettlements(
  settlements: {
    period: number;
    details: { concept: string; amount: { toNumber(): number } }[];
  }[],
): SettlementWithDetailsLike[] {
  return settlements.map((s) => ({
    period: s.period,
    details: s.details.map((d) => ({
      concept: d.concept,
      amount: d.amount.toNumber(),
    })),
  }));
}

function assertCompleteLiquidationData(
  property: PropertyLike,
  settlements: SettlementWithDetailsLike[],
): void {
  const missing: string[] = [];
  if (!property.cadastralCode?.trim()) missing.push('cadastral code');
  if (!property.address?.trim()) missing.push('property address');
  if (settlements.length === 0) missing.push('settlement periods');
  if (settlements.some((settlement) => settlement.details.length === 0)) {
    missing.push('settlement detail lines');
  }
  if (
    settlements.some(
      (settlement) =>
        !Number.isInteger(settlement.period) ||
        settlement.details.some(
          (detail) =>
            !detail.concept?.trim() || !Number.isFinite(detail.amount),
        ),
    )
  ) {
    missing.push('valid settlement values');
  }
  if (missing.length > 0) {
    throw new BadRequestException(
      `Cannot generate the liquidation PDF because required data is missing or invalid: ${missing.join(', ')}. Complete the liquidation and try again.`,
    );
  }
}

@Injectable()
export class GenerateLiquidationPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generateForSettlement(
    settlementId: number,
  ): Promise<GeneratedLiquidationPdf> {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      include: {
        property: { include: { owners: { include: { owner: true } } } },
      },
    });
    if (!settlement || settlement.replacedAt !== null) {
      throw new NotFoundException(`Settlement ${settlementId} not found.`);
    }

    const property: PropertyLike = settlement.property;

    let resolutionNumber: string;
    let templateSettlements: SettlementWithDetailsLike[];

    if (settlement.resolutionId !== null) {
      // Already generated before: re-render the SAME resolution, no new
      // consecutive reserved. A period with an active resolution never
      // becomes a candidate for another one.
      const resolution = await this.prisma.resolution.findUniqueOrThrow({
        where: { id: settlement.resolutionId },
        include: { settlements: { include: { details: true } } },
      });
      resolutionNumber = resolution.number;
      templateSettlements = toTemplateSettlements(resolution.settlements);
    } else {
      const currentYear = currentYearInColombia();
      const kind: ResolutionKind = isPrescriptionRisk(
        settlement.period,
        currentYear,
      )
        ? ResolutionKind.PRESCRIPTION_RISK
        : ResolutionKind.NORMAL;

      const candidates = await this.prisma.settlement.findMany({
        where: {
          propertyId: settlement.propertyId,
          replacedAt: null,
          resolutionId: null,
        },
        select: { id: true, period: true },
      });
      const group = groupSettlementsForResolution(
        candidates,
        settlementId,
        currentYear,
      );
      const groupIds = group.map((s) => s.id);

      // Validate the persisted detail rows before reserving a consecutive
      // resolution number. This prevents incomplete data from consuming a
      // number or leaving an associated resolution behind after a failed PDF.
      const preflightSettlements = await this.prisma.settlement.findMany({
        where: { id: { in: groupIds } },
        include: { details: true },
      });
      assertCompleteLiquidationData(
        property,
        toTemplateSettlements(preflightSettlements),
      );

      const { resolution, settlements: grouped } =
        await this.prisma.$transaction(async (tx) => {
          const reserved = await reserveResolutionNumber(tx, currentYear);
          const resolution = await tx.resolution.create({
            data: {
              number: reserved.number,
              year: reserved.year,
              sequence: reserved.sequence,
              kind,
              propertyId: settlement.propertyId,
            },
          });

          // Optimistic guard against a concurrent generation for the same
          // property+kind claiming one of these settlements first.
          const updated = await tx.settlement.updateMany({
            where: { id: { in: groupIds }, resolutionId: null },
            data: { resolutionId: resolution.id },
          });
          if (updated.count !== groupIds.length) {
            throw new ConflictException(
              'Another request already generated a liquidación covering one of these periods. Try again.',
            );
          }

          const settlements = await tx.settlement.findMany({
            where: { id: { in: groupIds } },
            include: { details: true },
          });
          return { resolution, settlements };
        });

      resolutionNumber = resolution.number;
      templateSettlements = toTemplateSettlements(grouped);
    }

    // Validate before template rendering so missing data never becomes a
    // misleading zero-value document.
    assertCompleteLiquidationData(property, templateSettlements);
    const templateData = buildLiquidationTemplateData(
      resolutionNumber,
      property,
      templateSettlements,
    );
    let docx: Buffer;
    let pdf: Buffer;
    try {
      docx = renderLiquidationDocx(templateData);
      pdf = await convertDocxToPdf(docx);
    } catch (error) {
      if (
        error instanceof LiquidationTemplateError ||
        error instanceof PdfConversionError
      ) {
        throw new ServiceUnavailableException(error.message);
      }
      throw error;
    }

    return { pdf, resolutionNumber };
  }
}
