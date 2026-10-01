import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import type { PublicSettlementQueryCriteria } from './public-settlement-query.service.js';
import { PublicSettlementQueryService } from './public-settlement-query.service.js';

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
