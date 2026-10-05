import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  StreamableFile,
  Query,
} from '@nestjs/common';
import type { Response } from 'express';
import { GenerateLiquidationPdfService } from '../resolutions/generate-liquidation-pdf.service.js';
import { SettlementsService } from './settlements.service.js';

@Controller('settlements')
export class SettlementsController {
  constructor(
    private readonly settlementsService: SettlementsService,
    private readonly generateLiquidationPdfService: GenerateLiquidationPdfService,
  ) {}

  @Get('search')
  search(
    @Query('cadastralCode') cadastralCode?: string,
    @Query('owner') owner?: string,
    @Query('address') address?: string,
  ) {
    return this.settlementsService.search({ cadastralCode, owner, address });
  }

  @Patch(':id/status')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: unknown,
  ) {
    return this.settlementsService.changeStatus(id, status);
  }

  @Post(':id/liquidation-pdf')
  async generateLiquidationPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { pdf, resolutionNumber } =
      await this.generateLiquidationPdfService.generateForSettlement(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${resolutionNumber}.pdf"`,
    });
    return new StreamableFile(pdf);
  }
}
