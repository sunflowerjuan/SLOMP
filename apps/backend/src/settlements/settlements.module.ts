import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ResolutionsModule } from '../resolutions/resolutions.module.js';
import {
  PUBLIC_QUERY_LIMIT,
  PUBLIC_QUERY_TTL_MS,
  PublicSettlementQueryController,
} from './public-settlement-query.controller.js';
import { PublicSettlementQueryService } from './public-settlement-query.service.js';
import { AlertsController } from './alerts.controller.js';
import { AlertsService } from './alerts.service.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';
import { EnFirmeService } from './en-firme.service.js';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      { ttl: PUBLIC_QUERY_TTL_MS, limit: PUBLIC_QUERY_LIMIT },
    ]),
    ResolutionsModule,
  ],
  controllers: [
    SettlementsController,
    AlertsController,
    PublicSettlementQueryController,
  ],
  providers: [
    SettlementsService,
    AlertsService,
    PublicSettlementQueryService,
    EnFirmeService,
  ],
})
export class SettlementsModule {}
