import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { ErrorDetails } from './coded-error.js';
import { ErrorCode } from './error-codes.js';

// Shape of every error response the API sends. `message` is a developer-facing
// English description (logs, Swagger, curl); the frontend shows the user the
// text it maps from `code`, never `message`.
export interface ApiErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetails;
}

// Payload to pass to any Nest HttpException, e.g.
// `throw new NotFoundException(errorBody(ErrorCode.X, 'Not found.'))`.
// The global ApiExceptionFilter adds statusCode when it serializes it.
export function errorBody(
  code: ErrorCode,
  message: string,
  details?: ErrorDetails,
): Omit<ApiErrorBody, 'statusCode'> {
  return details === undefined ? { code, message } : { code, message, details };
}

function collectConstraints(
  errors: ValidationError[],
  parentPath = '',
): { field: string; messages: string[] }[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const own = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];
    return [...own, ...collectConstraints(error.children ?? [], field)];
  });
}

// exceptionFactory for the global ValidationPipe: keeps class-validator's
// per-field messages in details instead of a bare string array.
export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  const fields = collectConstraints(errors);
  return new BadRequestException(
    errorBody(
      ErrorCode.REQUEST_VALIDATION_FAILED,
      fields.flatMap((field) => field.messages).join('. ') ||
        'The request is invalid.',
      { fields: fields.map((field) => field.field) },
    ),
  );
}
