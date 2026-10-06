import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ResolutionKind } from '@prisma/client';
import type { Response } from 'express';
import { BulkLiquidationsJobService } from './bulk-liquidations-job.service.js';
import { StartLiquidationsZipDto } from './start-liquidations-zip.dto.js';

@Controller('resolutions')
export class ResolutionsController {
  constructor(private readonly jobs: BulkLiquidationsJobService) {}

  @Get('liquidations-zip/pending') pending() {
    return this.jobs.pendingCounts();
  }

  @Post('liquidations-zip') start(@Body() body: StartLiquidationsZipDto) {
    return this.jobs.start(body.kind);
  }

  @Get('liquidations-zip/jobs/active') active() {
    return { job: this.jobs.getActive() };
  }

  @Get('liquidations-zip/jobs/:jobId/download') download(
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const job = this.jobs.get(jobId);
    const zip = this.jobs.download(jobId);
    const filename =
      job.kind === ResolutionKind.PRESCRIPTION_RISK
        ? 'liquidaciones-riesgo-prescripcion.zip'
        : 'liquidaciones-cobro-normal.zip';
    res.once('finish', () => this.jobs.deleteDownloadedJob(jobId));
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    return new StreamableFile(zip);
  }

  @Get('liquidations-zip/jobs/:jobId') get(@Param('jobId') jobId: string) {
    return this.jobs.get(jobId);
  }
}
