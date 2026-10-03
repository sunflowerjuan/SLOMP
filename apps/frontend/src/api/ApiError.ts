// status === 0 means the request never got a response (network down,
// backend off, CORS).
export const NETWORK_ERROR_STATUS = 0;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// NestJS responds to errors as { statusCode, message, error }, where
// `message` is a string or an array of strings (validation errors).
export function extractServerMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const { message } = payload as { message?: unknown };
  if (typeof message === "string") {
    return message;
  }
  if (Array.isArray(message)) {
    return message.filter((part) => typeof part === "string").join(". ");
  }
  return null;
}

interface ErrorMessageOptions {
  // A 401 on an authenticated endpoint is "session expired"; on login it's
  // "invalid credentials".
  unauthorizedMessage?: string;
}

// Single point that turns any error into the text the user sees.
export function getErrorMessage(
  error: unknown,
  { unauthorizedMessage }: ErrorMessageOptions = {},
): string {
  if (!(error instanceof ApiError)) {
    return "Ocurrió un error inesperado. Intenta de nuevo.";
  }

  if (error.status === NETWORK_ERROR_STATUS) {
    return "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.";
  }
  if (error.status === 401) {
    return (
      unauthorizedMessage ??
      "Tu sesión expiró. Vuelve a iniciar sesión para continuar."
    );
  }
  if (error.status === 403) {
    return "No tienes permisos para realizar esta acción.";
  }
  if (error.status === 429) {
    // Per-IP rate limit of the public consultation.
    return "Realizaste demasiadas consultas en poco tiempo. Espera unos minutos e intenta de nuevo.";
  }
  if (error.status === 413) {
    return "El archivo es demasiado grande.";
  }
  if (error.status >= 500) {
    return "El servidor tuvo un problema. Intenta de nuevo en unos minutos.";
  }
  return error.message;
}
