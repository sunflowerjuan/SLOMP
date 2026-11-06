import { Module } from '@nestjs/common';
import { PdfJobsModule } from '../pdf-jobs/pdf-jobs.module.js';
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';

@Module({
  imports: [PdfJobsModule],
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule {}
