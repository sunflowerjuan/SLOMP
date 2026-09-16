import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { TaxRollService } from './tax-roll.service.js';

describe('TaxRollService', () => {
  it('turns a parser failure (e.g. a blank Excel file) into a 400, not an unhandled 500', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('TaxRoll');
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const service = new TaxRollService();

    await expect(service.import(buffer)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
