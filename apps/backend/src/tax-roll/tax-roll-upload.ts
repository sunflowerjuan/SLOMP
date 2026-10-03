import {
  BadRequestException,
  Catch,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

// The real Páez tax roll (11,202 rows) weighs under 1 MB, so 10 MB leaves
// plenty of room while keeping a malicious or wrong upload from being fully
// buffered in memory.
export const MAX_TAX_ROLL_FILE_SIZE_MB = 10;
export const MAX_TAX_ROLL_FILE_SIZE_BYTES =
  MAX_TAX_ROLL_FILE_SIZE_MB * 1024 * 1024;

export const TAX_ROLL_UPLOAD_LIMITS = {
  fileSize: MAX_TAX_ROLL_FILE_SIZE_BYTES,
  files: 1,
};

// Multer aborts the upload as soon as the limit is crossed and Nest turns it
// into a 413 with multer's generic "File too large". The import endpoint
// reports every input problem as a 400 with a specific message (HU23), so
// this filter rewrites just that case.
@Catch(PayloadTooLargeException)
export class TaxRollFileTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const error = new BadRequestException(
      `The file exceeds the maximum allowed size of ${MAX_TAX_ROLL_FILE_SIZE_MB} MB.`,
    );
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(error.getStatus())
      .json(error.getResponse());
  }
}
