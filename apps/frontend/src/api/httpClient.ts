import { ApiError, NETWORK_ERROR_STATUS, extractServerError } from "./ApiError";
import { clearToken, getToken, setSession } from "./tokenStorage";
import type { Session, SessionResponse } from "./tokenStorage";

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

// AuthProvider registers here to find out when the session can't be renewed
// any more (expired, revoked or closed elsewhere) and close it from a single
// place.
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
  // true only for the session endpoints, which set or read the refresh
  // cookie.
  withCredentials?: boolean;
  signal?: AbortSignal;
}

interface PreparedRequest {
  method: string;
  headers: Record<string, string>;
  payload?: BodyInit;
  withCredentials?: boolean;
  signal?: AbortSignal;
}

async function send(
  path: string,
  { method, headers, payload, withCredentials, signal }: PreparedRequest,
  token: string | null,
): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers: token
        ? { ...headers, Authorization: `Bearer ${token}` }
        : headers,
      body: payload,
      credentials: withCredentials ? "include" : "same-origin",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(NETWORK_ERROR_STATUS, "Network error");
  }
}

const REFRESH_LOCK = "slomp.session-refresh";

async function renewSession(): Promise<Session | null> {
  const response = await send(
    "/auth/refresh",
    {
      method: "POST",
      headers: { Accept: "application/json" },
      withCredentials: true,
    },
    null,
  );
  const data = await parseBody(response);
  if (response.ok) {
    return setSession(data as SessionResponse);
  }
  if (response.status === 401) {
    return null;
  }
  throw toApiError(response, data);
}

let refreshInFlight: Promise<Session | null> | null = null;

// Exchanges the refresh cookie for a new access token. Resolves to null when
// there is no session to renew, and rejects when the backend couldn't be
// reached (the session may still be alive). Every caller in this tab shares
// one request, and tabs take turns: the backend treats a refresh token sent
// twice as stolen and closes the session.
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= (
    navigator.locks
      ? navigator.locks.request(REFRESH_LOCK, renewSession)
      : renewSession()
  ).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

// Sends the request with the access token. On a 401 it renews the session
// once and retries, so an expired token never reaches the screen that made
// the call; only when that fails is the session closed.
async function sendWithSession(
  path: string,
  prepared: PreparedRequest,
  authenticated: boolean,
): Promise<Response> {
  if (!authenticated) {
    return send(path, prepared, null);
  }
  const response = await send(path, prepared, getToken());
  if (response.status !== 401) {
    return response;
  }
  if (await refreshSession()) {
    const retried = await send(path, prepared, getToken());
    if (retried.status !== 401) {
      return retried;
    }
  }
  clearToken();
  unauthorizedHandler?.();
  return response;
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
  {
    method = "GET",
    body,
    authenticated = true,
    withCredentials,
    signal,
  }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await sendWithSession(
    path,
    { method, headers, payload, withCredentials, signal },
    authenticated,
  );

  const data = await parseBody(response);

  if (!response.ok) {
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

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const response = await sendWithSession(
    path,
    { method, headers, payload, signal },
    authenticated,
  );

  if (!response.ok) {
    // NestJS errors still arrive as JSON even when the endpoint normally
    // returns a PDF.
    throw toApiError(response, await parseBody(response));
  }

  return {
    blob: await response.blob(),
    fileName: parseContentDispositionFileName(
      response.headers.get("Content-Disposition"),
    ),
  };
}
