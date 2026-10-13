// Codes the worker publishes in pdf-results (contract: Confluence page
// "Servicio de PDF: contrato entre backend y worker (SL-118)", section 10).
export type JobErrorCode =
  | 'INVALID_MESSAGE'
  | 'PDF_TEMPLATE_UNAVAILABLE'
  | 'PDF_TEMPLATE_INVALID'
  | 'TEMPLATE_RENDER_FAILED'
  | 'PDF_CONVERSION_TIMEOUT'
  | 'PDF_CONVERSION_FAILED'
  | 'PDF_STORAGE_UNAVAILABLE'
  | 'BULK_ZIP_INCOMPLETE';

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
