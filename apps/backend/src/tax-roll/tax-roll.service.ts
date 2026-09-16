import { BadRequestException, Injectable } from '@nestjs/common';
import { parseTaxRollExcel } from './parse-tax-roll-excel.js';

@Injectable()
export class TaxRollService {
  async import(buffer: Buffer) {
    try {
      return await parseTaxRollExcel(buffer);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Could not read the Excel file.',
      );
    }
  }
}
