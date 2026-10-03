import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import type { PublicSettlementQueryCriteria } from './public-settlement-query.service.js';
import { PublicSettlementQueryService } from './public-settlement-query.service.js';

// Anonymous and unauthenticated, so it's the one endpoint in the whole API
// that needs its own per-IP rate limit (429 past the limit). The
// Administrator's search (settlements.controller.ts) is never subject to
// this -- it's a completely separate controller, already behind JWT.
@UseGuards(ThrottlerGuard)
@Controller('consulta-publica')
export class PublicSettlementQueryController {
  constructor(
    private readonly publicSettlementQueryService: PublicSettlementQueryService,
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
}
