import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { TaxRollService } from './tax-roll.service.js';

@Controller('tax-roll')
export class TaxRollController {
  constructor(private readonly taxRollService: TaxRollService) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  import(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
    // Multipart form fields always arrive as strings.
    @Body('confirmReplace') confirmReplace?: string,
    // Id del TaxRollImport que se esta confirmando (HU18) -- ver
    // TaxRollService.import.
    @Body('previousImportId') previousImportId?: string,
  ) {
    if (!file) {
      throw new BadRequestException(
        'You must attach an Excel file (.xlsx) in the "file" field.',
      );
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('The file must have a .xlsx extension.');
    }
    const parsedPreviousImportId = Number(previousImportId);
    return this.taxRollService.import(
      file.buffer,
      confirmReplace === 'true',
      file.originalname,
      user.id,
      previousImportId && Number.isInteger(parsedPreviousImportId)
        ? parsedPreviousImportId
        : undefined,
    );
  }

  @Get('imports')
  listImports() {
    return this.taxRollService.listImports();
  }
}
