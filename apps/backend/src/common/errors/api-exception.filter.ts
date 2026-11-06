import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import type { ApiErrorBody } from './error-body.js';
import { ErrorCode } from './error-codes.js';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.RESOURCE_NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

function fallbackCode(status: number): ErrorCode {
  return (
    CODE_BY_STATUS[status] ??
    (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST)
  );
}

function toMessage(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (Array.isArray(value)) {
    const parts = value.filter((part) => typeof part === 'string');
    if (parts.length > 0) return parts.join('. ');
  }
  return fallback;
}

// Builds the standard body for any thrown value. Exported so it can be unit
// tested without spinning up an HTTP server.
export function toApiErrorBody(exception: unknown): ApiErrorBody {
  if (!(exception instanceof HttpException)) {
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred.',
    };
  }

  const statusCode = exception.getStatus();
  if (exception instanceof ThrottlerException) {
    return {
      statusCode,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many requests. Wait a few minutes and try again.',
    };
  }

  const response = exception.getResponse();
  if (typeof response === 'string') {
    return { statusCode, code: fallbackCode(statusCode), message: response };
  }

  const payload = response as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };
  const code =
    typeof payload.code === 'string'
      ? (payload.code as ErrorCode)
      : fallbackCode(statusCode);
  const body: ApiErrorBody = {
    statusCode,
    code,
    message: toMessage(payload.message, exception.message),
  };
  if (typeof payload.details === 'object' && payload.details !== null) {
    body.details = payload.details as ApiErrorBody['details'];
  }
  return body;
}

// Every error leaves the API as { statusCode, code, message, details? }, so
// the frontend can rely on `code` for every endpoint. Unexpected errors are
// logged with their stack and reported as a 500 without leaking internals.
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const body = toApiErrorBody(exception);
    if (body.statusCode >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.message : String(exception),
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      return;
    }
    response.status(body.statusCode).json(body);
  }
}
