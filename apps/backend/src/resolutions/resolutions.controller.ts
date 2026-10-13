import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ResolutionKind } from '@prisma/client';
import type { Response } from 'express';
import { CurrentMunicipality } from '../municipalities/current-municipality.decorator.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { MunicipalityGuard } from '../municipalities/municipality.guard.js';
import { BulkLiquidationsJobService } from './bulk-liquidations-job.service.js';
import { StartLiquidationsZipDto } from './start-liquidations-zip.dto.js';

@UseGuards(MunicipalityGuard)
@Controller('municipalities/:slug/resolutions')
export class ResolutionsController {
  constructor(private readonly jobs: BulkLiquidationsJobService) {}

  @Get('liquidations-zip/pending') pending(
    @CurrentMunicipality() municipality: MunicipalityContext,
  ) {
    return this.jobs.pendingCounts(municipality.id);
  }

  @Post('liquidations-zip') start(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Body() body: StartLiquidationsZipDto,
  ) {
    return this.jobs.start(municipality.id, body.kind);
  }

  @Get('liquidations-zip/jobs/active') active(
    @CurrentMunicipality() municipality: MunicipalityContext,
  ) {
    return { job: this.jobs.getActive(municipality.id) };
  }

  @Get('liquidations-zip/jobs/:jobId/download') download(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Param('jobId') jobId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const job = this.jobs.get(municipality.id, jobId);
    const zip = this.jobs.download(municipality.id, jobId);
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

  @Get('liquidations-zip/jobs/:jobId') get(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Param('jobId') jobId: string,
  ) {
    return this.jobs.get(municipality.id, jobId);
  }
}
