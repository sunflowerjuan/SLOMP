import { BadRequestException } from '@nestjs/common';
import { CodedError } from '../common/errors/coded-error.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { parseTaxRollExcel } from './parse-tax-roll-excel.js';
import type { ParseTaxRollExcelResult } from './tax-roll-row.dto.js';

// Reads an uploaded tax roll Excel and turns any failure into a 400 with its
// error code. The payment orders Excel has the same columns and goes through
// exactly this.
export async function parseTaxRollUpload(
  buffer: Buffer,
): Promise<ParseTaxRollExcelResult> {
  try {
    return await parseTaxRollExcel(buffer);
  } catch (error) {
    if (error instanceof CodedError) {
      throw new BadRequestException(
        errorBody(error.code, error.message, error.details),
      );
    }
    throw new BadRequestException(
      errorBody(
        ErrorCode.TAX_ROLL_UNREADABLE,
        'Could not read the Excel file.',
      ),
      { cause: error },
    );
  }
}
