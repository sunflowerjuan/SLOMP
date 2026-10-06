import { GENERIC_ERROR_MESSAGES, messageForErrorCode } from "./errorMessages";
import type { ErrorDetails, MessageAudience } from "./errorMessages";

// status === 0 means the request never got a response (network down,
// backend off, CORS).
export const NETWORK_ERROR_STATUS = 0;

export class ApiError extends Error {
  status: number;
  // Stable backend error code, e.g. "TAX_ROLL_NOT_XLSX". Null when the
  // response had no standard error body.
  code: string | null;
  details: ErrorDetails;

  constructor(
    status: number,
    message: string,
    code: string | null = null,
    details: ErrorDetails = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface ServerError {
  // Developer-facing English description; never shown to the user.
  message: string | null;
  code: string | null;
  details: ErrorDetails;
}

// The backend answers every error as { statusCode, code, message, details? }.
export function extractServerError(payload: unknown): ServerError {
  if (typeof payload !== "object" || payload === null) {
    return { message: null, code: null, details: {} };
  }
  const { message, code, details } = payload as {
    message?: unknown;
    code?: unknown;
    details?: unknown;
  };
  return {
    message:
      typeof message === "string"
        ? message
        : Array.isArray(message)
          ? message.filter((part) => typeof part === "string").join(". ")
          : null,
    code: typeof code === "string" ? code : null,
    details:
      typeof details === "object" && details !== null
        ? (details as ErrorDetails)
        : {},
  };
}

interface ErrorMessageOptions {
  // Taxpayer-facing screens get messages that don't ask them to fix things
  // only the Administrator can fix.
  audience?: MessageAudience;
  // Used only for a 401 that arrives without a code.
  unauthorizedMessage?: string;
}

function messageForStatus(
  status: number,
  unauthorizedMessage?: string,
): string {
  if (status === 401) {
    return (
      unauthorizedMessage ??
      "Tu sesión expiró. Vuelve a iniciar sesión para continuar."
    );
  }
  if (status === 403) return "No tienes permisos para realizar esta acción.";
  if (status === 429) {
    return "Realizaste demasiadas consultas en poco tiempo. Espera unos minutos e intenta de nuevo.";
  }
  if (status === 413) return "El archivo es demasiado grande.";
  if (status >= 500) {
    return "El servidor tuvo un problema. Intenta de nuevo en unos minutos.";
  }
  return GENERIC_ERROR_MESSAGES.invalidRequest;
}

// Single point that turns any error into the text the user sees: the code's
// catalog entry first, then a message based on the HTTP status. The
// backend's English `message` is never shown.
export function getErrorMessage(
  error: unknown,
  { audience = "admin", unauthorizedMessage }: ErrorMessageOptions = {},
): string {
  if (!(error instanceof ApiError)) {
    return GENERIC_ERROR_MESSAGES.unexpected;
  }
  if (error.status === NETWORK_ERROR_STATUS) {
    return GENERIC_ERROR_MESSAGES.network;
  }
  if (error.code) {
    const fromCatalog = messageForErrorCode(
      error.code,
      error.details,
      audience,
    );
    if (fromCatalog) return fromCatalog;
  }
  return messageForStatus(error.status, unauthorizedMessage);
}
