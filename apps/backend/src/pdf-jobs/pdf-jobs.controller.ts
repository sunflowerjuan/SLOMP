import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { CurrentMunicipality } from '../municipalities/current-municipality.decorator.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { MunicipalityGuard } from '../municipalities/municipality.guard.js';
import {
  CreatePdfJobDto,
  PendingPdfJobsQueryDto,
} from './create-pdf-job.dto.js';
import { jobView, PdfJobsService } from './pdf-jobs.service.js';

@UseGuards(MunicipalityGuard)
@Controller('municipalities/:slug/pdf-jobs')
export class PdfJobsController {
  constructor(private readonly jobs: PdfJobsService) {}

  @Get('pending')
  pending(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Query() query: PendingPdfJobsQueryDto,
  ) {
    return this.jobs.pending(municipality.id, query.documentType);
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreatePdfJobDto,
  ) {
    return body.documentType === 'MANDAMIENTO'
      ? this.jobs.createPaymentOrders(
          municipality.id,
          user.id,
          body.settlementIds,
        )
      : this.jobs.create(municipality.id, user.id, body.kind);
  }

  @Get('active')
  async active(@CurrentMunicipality() municipality: MunicipalityContext) {
    const job = await this.jobs.activeJob(municipality.id);
    return { job: job && jobView(job) };
  }

  @Get(':id/download')
  async download(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { stream, fileName } = await this.jobs.download(municipality.id, id);
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    return new StreamableFile(stream);
  }

  @Get(':id')
  async get(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return jobView(await this.jobs.get(municipality.id, id));
  }
}
