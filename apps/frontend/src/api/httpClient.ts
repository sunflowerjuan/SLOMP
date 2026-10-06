import { ApiError, NETWORK_ERROR_STATUS, extractServerError } from "./ApiError";
import { clearToken, getToken } from "./tokenStorage";

function stripTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") {
    end -= 1;
  }
  return url.slice(0, end);
}

const API_URL = stripTrailingSlashes(
  import.meta.env.VITE_API_URL ?? "http://localhost:3000",
);

function toApiError(response: Response, data: unknown): ApiError {
  const { message, code, details } = extractServerError(data);
  return new ApiError(
    response.status,
    message ?? response.statusText,
    code,
    details,
  );
}

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

// AuthProvider registers here to find out when the backend rejects the
// token (expired or invalid) and close the session from a single place.
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  // JSON object or FormData (multipart). With FormData, Content-Type isn't
  // set: the browser adds the boundary.
  body?: unknown;
  // false for public endpoints (login): the token isn't attached and a 401
  // doesn't close the session.
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
    throw toApiError(response, data);
  }

  return data as T;
}

// Same as request(), but for binary responses (PDF). On success the body is
// not parsed as JSON: the Blob is returned as-is, along with the file name
// the backend suggests in Content-Disposition.
export interface BlobResponse {
  blob: Blob;
  fileName: string | null;
}

function parseContentDispositionFileName(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      // Falls back to the plain filename below.
    }
  }
  const plainMatch = /filename="?([^";]+)"?/i.exec(header);
  return plainMatch ? plainMatch[1].trim() : null;
}

export async function requestBlob(
  path: string,
  { method = "GET", body, authenticated = true, signal }: RequestOptions = {},
): Promise<BlobResponse> {
  const headers: Record<string, string> = {
    Accept: "application/pdf, application/zip, application/json",
  };

  if (authenticated) {
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let payload: BodyInit | undefined;
  if (body !== undefined) {
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

  if (!response.ok) {
    // NestJS errors still arrive as JSON even when the endpoint normally
    // returns a PDF.
    const data = await parseBody(response);
    if (response.status === 401 && authenticated) {
      clearToken();
      unauthorizedHandler?.();
    }
    throw toApiError(response, data);
  }

  return {
    blob: await response.blob(),
    fileName: parseContentDispositionFileName(
      response.headers.get("Content-Disposition"),
    ),
  };
}
