import {
  ApiError,
  NETWORK_ERROR_STATUS,
  extractServerMessage,
} from "./ApiError";
import { clearToken, getToken } from "./tokenStorage";

const API_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:3000"
).replace(/\/+$/, "");

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

// AuthProvider se registra aqui para enterarse cuando el backend rechaza el
// token (expirado o invalido) y cerrar la sesion en un solo lugar.
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  // Objeto JSON o FormData (multipart). Con FormData no se fija Content-Type:
  // el navegador agrega el boundary.
  body?: unknown;
  // false para endpoints publicos (login): no se adjunta el token y un 401
  // no cierra la sesion.
  authenticated?: boolean;
  signal?: AbortSignal;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function request<T>(
  path: string,
  { method = "GET", body, authenticated = true, signal }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };

  if (authenticated) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: payload,
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(NETWORK_ERROR_STATUS, "Network error");
  }

  const data = await parseBody(response);

  if (!response.ok) {
    if (response.status === 401 && authenticated) {
      clearToken();
      unauthorizedHandler?.();
    }
    throw new ApiError(
      response.status,
      extractServerMessage(data) ?? response.statusText,
    );
  }

  return data as T;
}
