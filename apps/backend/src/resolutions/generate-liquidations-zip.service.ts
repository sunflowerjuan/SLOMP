import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ResolutionKind } from '@prisma/client';
import PizZip from 'pizzip';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  currentYearInColombia,
  PRESCRIPTION_YEARS,
} from '../tax-roll/period-rules.js';
import { GenerateLiquidationPdfService } from './generate-liquidation-pdf.service.js';
import { selectGenerationTriggers } from './select-generation-triggers.js';

// Bounds how many PDFs one request generates in sequence (each spawns its
// own LibreOffice process via GenerateLiquidationPdfService). The async
// queue + serverless generator is the real fix for a bigger portfolio
// (ADR-12 "objetivo"); this is the demo-scope guard against a request that
// never comes back.
export const MAX_BULK_LIQUIDATIONS = 50;

@Injectable()
export class GenerateLiquidationsZipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly generateLiquidationPdfService: GenerateLiquidationPdfService,
  ) {}

  async generateZip(): Promise<Buffer> {
    const currentYear = currentYearInColombia();

    const pending = await this.prisma.settlement.findMany({
      where: { replacedAt: null, resolutionId: null },
      select: { id: true, propertyId: true, period: true },
    });
    const triggers = selectGenerationTriggers(pending, currentYear);

    if (triggers.length === 0) {
      throw new NotFoundException('No pending liquidations to generate.');
    }
    if (triggers.length > MAX_BULK_LIQUIDATIONS) {
      throw new BadRequestException(
        `There are ${triggers.length} pending liquidations, over the ${MAX_BULK_LIQUIDATIONS} limit for a single bulk request.`,
      );
    }

    // The cutoff year the prescription-risk rule actually uses today (e.g.
    // currentYear 2026 -> periods up to 2021 are at risk, 2022 onward are
    // not) -- read off PRESCRIPTION_YEARS instead of hardcoding it, so the
    // folder names never drift from the real rule.
    const cutoffYear = currentYear - PRESCRIPTION_YEARS + 1;
    const zip = new PizZip();

    for (const trigger of triggers) {
      const { pdf, resolutionNumber } =
        await this.generateLiquidationPdfService.generateForSettlement(
          trigger.id,
        );
      const folder =
        trigger.kind === ResolutionKind.PRESCRIPTION_RISK
          ? `Liquidaciones antes de ${cutoffYear}`
          : `Liquidaciones ${cutoffYear} en adelante`;
      zip.file(`${folder}/${resolutionNumber}.pdf`, pdf);
    }

    // Built entirely in memory: unlike the per-PDF LibreOffice conversion,
    // packaging the already-generated PDF buffers never touches disk.
    return zip.generate({ type: 'nodebuffer' });
  }
}
