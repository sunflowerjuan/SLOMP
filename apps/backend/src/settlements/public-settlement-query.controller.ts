import {
  Body,
  Controller,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { GenerateLiquidationPdfService } from '../resolutions/generate-liquidation-pdf.service.js';
import { GenerateLiquidationDto } from '../resolutions/generate-liquidation.dto.js';
import type { PublicSettlementQueryCriteria } from './public-settlement-query.service.js';
import { PublicSettlementQueryService } from './public-settlement-query.service.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';

export const PUBLIC_QUERY_LIMIT = 30;
export const PUBLIC_QUERY_TTL_MS = 60_000;

// Generating a PDF is far more expensive than a plain lookup (it spawns a
// LibreOffice process per call), so it gets its own, much stricter limit
// via @Throttle on just that route -- the plain lookup above keeps its
// 30/min from the controller-level ThrottlerModule config.
const LIQUIDATION_PDF_LIMIT = 5;
const LIQUIDATION_PDF_TTL_MS = 60_000;

// ponytail: In-memory counts are per instance; use shared storage such as Redis only when scaling out.
@Controller('consulta-publica')
@UseGuards(ThrottlerGuard)
export class PublicSettlementQueryController {
  constructor(
    @Inject(PublicSettlementQueryService)
    private readonly publicSettlementQueryService: PublicSettlementQueryService,
    private readonly generateLiquidationPdfService: GenerateLiquidationPdfService,
  ) {}

  @Public()
  @Post()
  query(@Body() body: PublicSettlementQueryCriteria) {
    return this.publicSettlementQueryService.query({
      cadastralCode: body?.cadastralCode,
      ownerName: body?.ownerName,
      address: body?.address,
    });
  }

  @Public()
  @Throttle({
    default: { limit: LIQUIDATION_PDF_LIMIT, ttl: LIQUIDATION_PDF_TTL_MS },
  })
  @Post(':id/liquidacion-pdf')
  async generateLiquidationPdf(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: GenerateLiquidationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Re-validate ownership with the SAME exact-match query the citizen
    // already searched with -- never trust a bare id with no corroborating
    // data, to avoid letting someone enumerate settlements by id. A mismatch
    // looks exactly like "not found", never a 403: the public service's
    // whole design never reveals which part of a guess was right.
    const matches = await this.publicSettlementQueryService.query({
      cadastralCode: body?.cadastralCode,
      ownerName: body?.ownerName,
      address: body?.address,
    });
    if (!matches.some((settlement) => settlement.settlementId === id)) {
      throw new NotFoundException(
        errorBody(
          ErrorCode.SETTLEMENT_NOT_FOUND,
          `Settlement ${id} not found.`,
        ),
      );
    }

    const { pdf, resolutionNumber } =
      await this.generateLiquidationPdfService.generateForSettlement(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${resolutionNumber}.pdf"`,
    });
    return new StreamableFile(pdf);
  }
}
