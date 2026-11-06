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
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { CurrentMunicipality } from '../municipalities/current-municipality.decorator.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { MunicipalityGuard } from '../municipalities/municipality.guard.js';
import { GenerateLiquidationPdfService } from '../resolutions/generate-liquidation-pdf.service.js';
import { SettlementsService } from './settlements.service.js';

@UseGuards(MunicipalityGuard)
@Controller('municipalities/:slug/settlements')
export class SettlementsController {
  constructor(
    private readonly settlementsService: SettlementsService,
    private readonly generateLiquidationPdfService: GenerateLiquidationPdfService,
  ) {}

  @Get('search')
  search(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Query('cadastralCode') cadastralCode?: string,
    @Query('owner') owner?: string,
    @Query('address') address?: string,
  ) {
    return this.settlementsService.search(municipality.id, {
      cadastralCode,
      owner,
      address,
    });
  }

  @Patch(':id/status')
  changeStatus(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: unknown,
  ) {
    return this.settlementsService.changeStatus(
      municipality.id,
      user.id,
      id,
      status,
    );
  }

  @Post(':id/liquidation-pdf')
  async generateLiquidationPdf(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { pdf, resolutionNumber } =
      await this.generateLiquidationPdfService.generateForSettlement(
        municipality.id,
        id,
      );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${resolutionNumber}.pdf"`,
    });
    return new StreamableFile(pdf);
  }
}
