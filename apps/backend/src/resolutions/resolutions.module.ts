import { Module } from '@nestjs/common';
import { GenerateLiquidationPdfService } from './generate-liquidation-pdf.service.js';

@Module({
  providers: [GenerateLiquidationPdfService],
  exports: [GenerateLiquidationPdfService],
})
export class ResolutionsModule {}
