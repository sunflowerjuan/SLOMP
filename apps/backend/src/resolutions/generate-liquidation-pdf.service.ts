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
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';

export interface GeneratedLiquidationPdf {
  pdf: Buffer;
  resolutionNumber: string;
}

export interface PreparedLiquidationDocx {
  docx: Buffer;
  resolutionNumber: string;
  kind: ResolutionKind;
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
  // Stable keys (not prose) so the frontend can name each missing field.
  const missing: string[] = [];
  if (!property.cadastralCode?.trim()) missing.push('CADASTRAL_CODE');
  if (!property.address?.trim()) missing.push('PROPERTY_ADDRESS');
  if (settlements.length === 0) missing.push('SETTLEMENT_PERIODS');
  if (settlements.some((settlement) => settlement.details.length === 0)) {
    missing.push('SETTLEMENT_DETAILS');
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
    missing.push('SETTLEMENT_VALUES');
  }
  if (missing.length > 0) {
    throw new BadRequestException(
      errorBody(
        ErrorCode.LIQUIDATION_DATA_INCOMPLETE,
        `Cannot generate the liquidation PDF because required data is missing or invalid: ${missing.join(', ')}. Complete the liquidation and try again.`,
        { missing },
      ),
    );
  }
}

@Injectable()
export class GenerateLiquidationPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generateForSettlement(
    settlementId: number,
  ): Promise<GeneratedLiquidationPdf> {
    const prepared = await this.prepareLiquidationDocx(settlementId);
    let pdf: Buffer;
    try {
      pdf = await convertDocxToPdf(prepared.docx);
    } catch (error) {
      if (error instanceof PdfConversionError) {
        throw new ServiceUnavailableException(
          errorBody(error.code, error.message),
          { cause: error },
        );
      }
      throw error;
    }
    return { pdf, resolutionNumber: prepared.resolutionNumber };
  }

  async prepareLiquidationDocx(
    settlementId: number,
  ): Promise<PreparedLiquidationDocx> {
    const settlement = await this.prisma.settlement.findUnique({
      where: { id: settlementId },
      include: {
        property: { include: { owners: { include: { owner: true } } } },
      },
    });
    if (!settlement || settlement.replacedAt !== null) {
      throw new NotFoundException(
        errorBody(
          ErrorCode.SETTLEMENT_NOT_FOUND,
          `Settlement ${settlementId} not found.`,
        ),
      );
    }

    const property: PropertyLike = settlement.property;

    let resolutionNumber: string;
    let kind: ResolutionKind;
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
      kind = resolution.kind;
      templateSettlements = toTemplateSettlements(resolution.settlements);
    } else {
      const currentYear = currentYearInColombia();
      kind = isPrescriptionRisk(settlement.period, currentYear)
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
              errorBody(
                ErrorCode.LIQUIDATION_CONCURRENT_GENERATION,
                'Another request already generated a liquidación covering one of these periods. Try again.',
              ),
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
    try {
      docx = renderLiquidationDocx(templateData);
    } catch (error) {
      if (error instanceof LiquidationTemplateError) {
        throw new ServiceUnavailableException(
          errorBody(error.code, error.message),
          { cause: error },
        );
      }
      throw error;
    }

    return { docx, resolutionNumber, kind };
  }
}
