import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseTaxRollExcel } from './parse-tax-roll-excel.js';
import { persistTaxRoll } from './persist-tax-roll.js';

@Injectable()
export class TaxRollService {
  constructor(private readonly prisma: PrismaService) {}

  async import(buffer: Buffer, confirmReplace: boolean) {
    const parsed = await this.parse(buffer);
    const persisted = await persistTaxRoll(
      this.prisma,
      parsed.validRows,
      confirmReplace,
    );
    return { ...parsed, persisted };
  }

  private async parse(buffer: Buffer) {
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
