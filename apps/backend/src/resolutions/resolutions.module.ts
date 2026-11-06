import { Module } from '@nestjs/common';
import { PdfJobsModule } from '../pdf-jobs/pdf-jobs.module.js';
import { GenerateLiquidationPdfService } from './generate-liquidation-pdf.service.js';

@Module({
  imports: [PdfJobsModule],
  providers: [GenerateLiquidationPdfService],
  exports: [GenerateLiquidationPdfService],
})
export class ResolutionsModule {}
