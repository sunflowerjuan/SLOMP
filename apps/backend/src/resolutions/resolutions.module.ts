import { Module } from '@nestjs/common';
import { GenerateLiquidationPdfService } from './generate-liquidation-pdf.service.js';
import { BulkLiquidationsJobService } from './bulk-liquidations-job.service.js';
import { ResolutionsController } from './resolutions.controller.js';

@Module({
  controllers: [ResolutionsController],
  providers: [GenerateLiquidationPdfService, BulkLiquidationsJobService],
  exports: [GenerateLiquidationPdfService],
})
export class ResolutionsModule {}
