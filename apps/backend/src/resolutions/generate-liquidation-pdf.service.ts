import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ResolutionKind } from '@prisma/client';
import {
  buildLiquidationTemplateData,
  missingLiquidationData,
  toTemplateSettlements,
  type PropertyLike,
  type SettlementWithDetailsLike,
} from '../liquidation-template/build-liquidation-template-data.js';
import { lockCounter } from '../pdf-jobs/counter-lock.js';
import { ACTIVE_JOB_STATUSES } from '../pdf-jobs/pdf-job-rules.js';
import { PdfServiceClient } from '../pdf-jobs/pdf-service.client.js';
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

function assertCompleteLiquidationData(
  property: PropertyLike,
  settlements: SettlementWithDetailsLike[],
): void {
  const missing = missingLiquidationData(property, settlements);
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

function settlementNotFound(settlementId: number): NotFoundException {
  return new NotFoundException(
    errorBody(
      ErrorCode.SETTLEMENT_NOT_FOUND,
      `Settlement ${settlementId} not found.`,
    ),
  );
}

@Injectable()
export class GenerateLiquidationPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfServiceClient,
  ) {}

  // Administrator panel: issues the resolution (reserving its consecutive)
  // the first time, re-renders it afterwards.
  generateForSettlement(
    municipalityId: number,
    settlementId: number,
  ): Promise<GeneratedLiquidationPdf> {
    return this.generate(municipalityId, settlementId, true);
  }

  // Public consultation: only resolutions already issued, never reserving a
  // number (Confluence SL-118, section 2). Not issued looks like not found.
  generateIssued(
    municipalityId: number,
    settlementId: number,
  ): Promise<GeneratedLiquidationPdf> {
    return this.generate(municipalityId, settlementId, false);
  }

  private async generate(
    municipalityId: number,
    settlementId: number,
    mayIssue: boolean,
  ): Promise<GeneratedLiquidationPdf> {
    // Before reserving anything: a missing template must not consume a number.
    const template = await this.pdf.liquidationTemplate(municipalityId);
    const { data, resolutionNumber } = await this.prepareLiquidationData(
      municipalityId,
      settlementId,
      mayIssue,
    );
    const pdf = await this.pdf.render({
      schemaVersion: 1,
      documentType: 'LIQUIDACION',
      template,
      data: data as unknown as Record<string, unknown>,
    });
    return { pdf, resolutionNumber };
  }

  private async prepareLiquidationData(
    municipalityId: number,
    settlementId: number,
    mayIssue: boolean,
  ) {
    // A settlement of another municipality is "not found", same as one that
    // does not exist.
    const settlement = await this.prisma.settlement.findFirst({
      where: { id: settlementId, property: { municipalityId } },
      include: {
        property: { include: { owners: { include: { owner: true } } } },
      },
    });
    if (
      !settlement ||
      settlement.replacedAt !== null ||
      (!mayIssue && settlement.resolutionId === null)
    ) {
      throw settlementNotFound(settlementId);
    }

    const property: PropertyLike = settlement.property;

    let resolutionNumber: string;
    let templateSettlements: SettlementWithDetailsLike[];

    if (settlement.resolutionId !== null) {
      // Already generated before: re-render the SAME resolution, no new
      // consecutive reserved. A period with an active resolution never
      // becomes a candidate for another one.
      const resolution = await this.prisma.resolution.findFirstOrThrow({
        where: { id: settlement.resolutionId, municipalityId },
        include: { settlements: { include: { details: true } } },
      });
      resolutionNumber = resolution.number;
      templateSettlements = toTemplateSettlements(resolution.settlements);
    } else {
      const currentYear = currentYearInColombia();
      const kind = isPrescriptionRisk(settlement.period, currentYear)
        ? ResolutionKind.PRESCRIPTION_RISK
        : ResolutionKind.NORMAL;

      const candidates = await this.prisma.settlement.findMany({
        where: {
          propertyId: settlement.propertyId,
          property: { municipalityId },
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
        where: { id: { in: groupIds }, property: { municipalityId } },
        include: { details: true },
      });
      assertCompleteLiquidationData(
        property,
        toTemplateSettlements(preflightSettlements),
      );

      const { resolution, settlements: grouped } =
        await this.prisma.$transaction(async (tx) => {
          // Same lock as the bulk job: while the municipality has one
          // running, its range must stay contiguous so it can be reverted.
          await lockCounter(tx, municipalityId, currentYear);
          const activeJobs = await tx.pdfJob.count({
            where: { municipalityId, status: { in: ACTIVE_JOB_STATUSES } },
          });
          if (activeJobs > 0) {
            throw new ConflictException(
              errorBody(
                ErrorCode.BULK_GENERATION_IN_PROGRESS,
                'A bulk generation job is running for this municipality. Try again when it finishes.',
              ),
            );
          }
          const reserved = await reserveResolutionNumber(
            tx,
            municipalityId,
            currentYear,
          );
          const resolution = await tx.resolution.create({
            data: {
              number: reserved.number,
              year: reserved.year,
              sequence: reserved.sequence,
              kind,
              propertyId: settlement.propertyId,
              municipalityId,
            },
          });

          // Optimistic guard against a concurrent generation for the same
          // property+kind claiming one of these settlements first.
          const updated = await tx.settlement.updateMany({
            where: {
              id: { in: groupIds },
              property: { municipalityId },
              resolutionId: null,
            },
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
            where: { id: { in: groupIds }, property: { municipalityId } },
            include: { details: true },
          });
          return { resolution, settlements };
        });

      resolutionNumber = resolution.number;
      templateSettlements = toTemplateSettlements(grouped);
    }

    // Validate before rendering so missing data never becomes a misleading
    // zero-value document.
    assertCompleteLiquidationData(property, templateSettlements);
    return {
      resolutionNumber,
      data: buildLiquidationTemplateData(
        resolutionNumber,
        property,
        templateSettlements,
      ),
    };
  }
}
