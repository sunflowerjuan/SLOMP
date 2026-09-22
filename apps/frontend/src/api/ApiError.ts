// status === 0 significa que la peticion nunca obtuvo respuesta (red caida,
// backend apagado, CORS).
export const NETWORK_ERROR_STATUS = 0;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// NestJS responde los errores como { statusCode, message, error }, donde
// `message` es un string o un arreglo de strings (validaciones).
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
  // Un 401 en un endpoint autenticado es "sesion expirada"; en el login es
  // "credenciales invalidas".
  unauthorizedMessage?: string;
}

// Punto unico para convertir cualquier error en el texto que ve el usuario.
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
  if (error.status === 413) {
    return "El archivo es demasiado grande.";
  }
  if (error.status >= 500) {
    return "El servidor tuvo un problema. Intenta de nuevo en unos minutos.";
  }
  return error.message;
}
