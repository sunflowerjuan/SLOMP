import type { ErrorCode } from './error-codes.js';

export type ErrorDetails = Record<string, unknown>;

// Plain Error with a stable code and optional structured details. It has no
// HTTP or NestJS dependency on purpose, so domain functions can throw it and
// the service layer decides which HTTP status it maps to.
export class CodedError extends Error {
  readonly code: ErrorCode;
  readonly details?: ErrorDetails;

  constructor(
    code: ErrorCode,
    message: string,
    details?: ErrorDetails,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CodedError';
    this.code = code;
    this.details = details;
  }
}
