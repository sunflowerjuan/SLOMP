import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { GenerateLiquidationPdfService } from '../resolutions/generate-liquidation-pdf.service.js';
import { GenerateLiquidationDto } from '../resolutions/generate-liquidation.dto.js';
import type { PublicSettlementQueryCriteria } from './public-settlement-query.service.js';
import { PublicSettlementQueryService } from './public-settlement-query.service.js';
import { MunicipalityThrottlerGuard } from './municipality-throttler.guard.js';
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

// Every route is scoped to one municipality by :slug, which is what each
// municipality's own iframe calls. There is deliberately no unscoped route:
// a lookup that spanned municipalities would leak one's data into another's.
// ponytail: In-memory counts are per instance; use shared storage such as Redis only when scaling out.
@Controller('consulta-publica')
@UseGuards(MunicipalityThrottlerGuard)
export class PublicSettlementQueryController {
  constructor(
    @Inject(PublicSettlementQueryService)
    private readonly publicSettlementQueryService: PublicSettlementQueryService,
    private readonly generateLiquidationPdfService: GenerateLiquidationPdfService,
  ) {}

  // What the iframe page needs to introduce itself (the municipality's name).
  // Unlike the lookups below this one does say "unknown" (404): the page has
  // to show "Consulta no disponible". It exposes nothing but the name, and
  // never lists municipalities.
  @Public()
  @Get(':slug')
  async info(@Param('slug') slug: string) {
    const municipality =
      await this.publicSettlementQueryService.findPublicMunicipality(slug);
    if (!municipality) {
      throw new NotFoundException(
        errorBody(ErrorCode.MUNICIPALITY_NOT_FOUND, 'Consulta no disponible.'),
      );
    }
    return { slug: municipality.slug, name: municipality.name };
  }

  @Public()
  @Post(':slug')
  query(
    @Param('slug') slug: string,
    @Body() body: PublicSettlementQueryCriteria,
  ) {
    return this.publicSettlementQueryService.queryBySlug(slug, {
      cadastralCode: body?.cadastralCode,
      ownerName: body?.ownerName,
      address: body?.address,
    });
  }

  @Public()
  @Throttle({
    default: { limit: LIQUIDATION_PDF_LIMIT, ttl: LIQUIDATION_PDF_TTL_MS },
  })
  @Post(':slug/:id/liquidacion-pdf')
  async generateLiquidationPdf(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: GenerateLiquidationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Re-validate ownership with the SAME exact-match query the citizen
    // already searched with -- never trust a bare id with no corroborating
    // data, to avoid letting someone enumerate settlements by id. The query
    // is pinned to the municipality of :slug, so an id from another
    // municipality, a mismatch and an unknown slug all look exactly like
    // "not found", never a 403: the public service's whole design never
    // reveals which part of a guess was right.
    const municipality =
      await this.publicSettlementQueryService.findPublicMunicipality(slug);
    const matches = municipality
      ? await this.publicSettlementQueryService.query(municipality.id, {
          cadastralCode: body?.cadastralCode,
          ownerName: body?.ownerName,
          address: body?.address,
        })
      : [];
    if (
      !municipality ||
      !matches.some((settlement) => settlement.settlementId === id)
    ) {
      throw new NotFoundException(
        errorBody(
          ErrorCode.SETTLEMENT_NOT_FOUND,
          `Settlement ${id} not found.`,
        ),
      );
    }

    const { pdf, resolutionNumber } =
      await this.generateLiquidationPdfService.generateForSettlement(
        municipality.id,
        id,
      );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${resolutionNumber}.pdf"`,
    });
    return new StreamableFile(pdf);
  }
}
