import type { JobErrorCode } from 'shared/pdf-contract';

export type { JobErrorCode };

// Permanent errors fail the job right away; transient ones (LibreOffice,
// Storage hiccups) leave the queue message to be retried.
const PERMANENT: ReadonlySet<JobErrorCode> = new Set([
  'INVALID_MESSAGE',
  'PDF_TEMPLATE_UNAVAILABLE',
  'PDF_TEMPLATE_INVALID',
  'TEMPLATE_RENDER_FAILED',
  'BULK_ZIP_INCOMPLETE',
]);

export class JobError extends Error {
  readonly code: JobErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: JobErrorCode,
    message: string,
    details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'JobError';
    this.code = code;
    this.details = details;
  }

  get permanent(): boolean {
    return PERMANENT.has(this.code);
  }
}
