import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TaxRollService } from './tax-roll.service.js';

@Controller('tax-roll')
export class TaxRollController {
  constructor(private readonly taxRollService: TaxRollService) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  import(
    @UploadedFile() file?: Express.Multer.File,
    // Multipart form fields always arrive as strings.
    @Body('confirmReplace') confirmReplace?: string,
  ) {
    if (!file) {
      throw new BadRequestException(
        'You must attach an Excel file (.xlsx) in the "file" field.',
      );
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('The file must have a .xlsx extension.');
    }
    return this.taxRollService.import(file.buffer, confirmReplace === 'true');
  }
}
