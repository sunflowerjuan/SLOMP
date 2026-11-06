import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { ValidationError } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { toApiErrorBody } from './api-exception.filter.js';
import { errorBody, validationExceptionFactory } from './error-body.js';
import { ErrorCode } from './error-codes.js';

describe('toApiErrorBody', () => {
  it('keeps the code, message and details of a coded HttpException', () => {
    const exception = new BadRequestException(
      errorBody(ErrorCode.BULK_LIMIT_EXCEEDED, 'Over the limit.', {
        count: 600,
        max: 500,
      }),
    );

    expect(toApiErrorBody(exception)).toEqual({
      statusCode: 400,
      code: 'BULK_LIMIT_EXCEEDED',
      message: 'Over the limit.',
      details: { count: 600, max: 500 },
    });
  });

  it('derives a code from the status when the exception has none', () => {
    expect(toApiErrorBody(new NotFoundException('Cannot GET /nope'))).toEqual({
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Cannot GET /nope',
    });
    expect(toApiErrorBody(new UnauthorizedException())).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHORIZED',
    });
  });

  it('keeps the specific code of a 5xx instead of collapsing it into a generic one', () => {
    const exception = new ServiceUnavailableException(
      errorBody(ErrorCode.PDF_TEMPLATE_INVALID, 'Template is corrupted.'),
    );

    expect(toApiErrorBody(exception)).toMatchObject({
      statusCode: 503,
      code: 'PDF_TEMPLATE_INVALID',
    });
  });

  it('reports the rate limiter as RATE_LIMITED', () => {
    expect(toApiErrorBody(new ThrottlerException())).toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
    });
  });

  it('turns any non-HTTP error into a 500 without leaking its message', () => {
    const body = toApiErrorBody(
      new Error('connect ECONNREFUSED 10.0.0.4:5432'),
    );

    expect(body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    });
  });
});

describe('validationExceptionFactory', () => {
  it('produces REQUEST_VALIDATION_FAILED with the offending fields', () => {
    const emailError = Object.assign(new ValidationError(), {
      property: 'email',
      constraints: { isEmail: 'email must be an email' },
      children: [],
    });
    const extraError = Object.assign(new ValidationError(), {
      property: 'role',
      constraints: { whitelistValidation: 'property role should not exist' },
      children: [],
    });

    const body = toApiErrorBody(
      validationExceptionFactory([emailError, extraError]),
    );

    expect(body).toEqual({
      statusCode: 400,
      code: 'REQUEST_VALIDATION_FAILED',
      message: 'email must be an email. property role should not exist',
      details: { fields: ['email', 'role'] },
    });
  });
});
