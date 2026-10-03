import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator.js';
import type { PublicSettlementQueryCriteria } from './public-settlement-query.service.js';
import { PublicSettlementQueryService } from './public-settlement-query.service.js';

export const PUBLIC_QUERY_LIMIT = 30;
export const PUBLIC_QUERY_TTL_MS = 60_000;

// ponytail: In-memory counts are per instance; use shared storage such as Redis only when scaling out.
@Controller('consulta-publica')
@UseGuards(ThrottlerGuard)
export class PublicSettlementQueryController {
  constructor(
    @Inject(PublicSettlementQueryService)
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
