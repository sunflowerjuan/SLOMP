import { Module } from '@nestjs/common';
import { GenerateLiquidationPdfService } from './generate-liquidation-pdf.service.js';
import { GenerateLiquidationsZipService } from './generate-liquidations-zip.service.js';
import { ResolutionsController } from './resolutions.controller.js';

@Module({
  controllers: [ResolutionsController],
  providers: [GenerateLiquidationPdfService, GenerateLiquidationsZipService],
  exports: [GenerateLiquidationPdfService],
})
export class ResolutionsModule {}
