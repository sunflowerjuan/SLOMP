import { Module } from '@nestjs/common';
import { PdfJobsController } from './pdf-jobs.controller.js';
import { PdfJobsService } from './pdf-jobs.service.js';
import { PdfJobsWorker } from './pdf-jobs.worker.js';
import { PdfServiceClient } from './pdf-service.client.js';

@Module({
  controllers: [PdfJobsController],
  providers: [PdfServiceClient, PdfJobsService, PdfJobsWorker],
  exports: [PdfServiceClient],
})
export class PdfJobsModule {}
