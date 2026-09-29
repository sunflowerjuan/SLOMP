import { Module } from '@nestjs/common';
import { PublicSettlementQueryController } from './public-settlement-query.controller.js';
import { PublicSettlementQueryService } from './public-settlement-query.service.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  controllers: [SettlementsController, PublicSettlementQueryController],
  providers: [SettlementsService, PublicSettlementQueryService],
})
export class SettlementsModule {}
