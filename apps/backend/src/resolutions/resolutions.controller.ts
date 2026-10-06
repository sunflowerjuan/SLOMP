import { Controller, Post, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { GenerateLiquidationsZipService } from './generate-liquidations-zip.service.js';

@Controller('resolutions')
export class ResolutionsController {
  constructor(
    private readonly generateLiquidationsZipService: GenerateLiquidationsZipService,
  ) {}

  @Post('liquidations-zip')
  async generateLiquidationsZip(@Res({ passthrough: true }) res: Response) {
    const zip = await this.generateLiquidationsZipService.generateZip();
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="liquidaciones.zip"',
    });
    return new StreamableFile(zip);
  }
}
