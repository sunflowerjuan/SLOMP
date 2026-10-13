import {
  BadRequestException,
  Catch,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';

// The official Páez template is under 100 KB; 5 MB leaves room for images
// while keeping a wrong upload from being fully buffered in memory.
export const MAX_TEMPLATE_FILE_SIZE_MB = 5;
export const MAX_TEMPLATE_FILE_SIZE_BYTES =
  MAX_TEMPLATE_FILE_SIZE_MB * 1024 * 1024;

export const TEMPLATE_UPLOAD_LIMITS = {
  fileSize: MAX_TEMPLATE_FILE_SIZE_BYTES,
  files: 1,
};

// Multer aborts at the limit and Nest turns it into a 413 with a generic
// message; the panel needs the specific code, same as the tax roll upload.
@Catch(PayloadTooLargeException)
export class TemplateFileTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const error = new BadRequestException(
      errorBody(
        ErrorCode.TEMPLATE_FILE_TOO_LARGE,
        `The file exceeds the maximum allowed size of ${MAX_TEMPLATE_FILE_SIZE_MB} MB.`,
        { maxSizeMb: MAX_TEMPLATE_FILE_SIZE_MB },
      ),
    );
    // Controller-scoped filters run instead of the global one, so the
    // statusCode has to be added here to keep the standard body shape.
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(error.getStatus())
      .json({
        statusCode: error.getStatus(),
        ...(error.getResponse() as object),
      });
  }
}
