import { adminCredentials, apiUrl } from "./env";

// Signs in through the API; a test that needs starting data does it this way
// instead of clicking through the screens.
export async function apiLogin(): Promise<string> {
  const { email, password } = adminCredentials();
  const login = await fetch(`${apiUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!login.ok) {
    throw new Error(`El login por API falló (${login.status}).`);
  }
  return ((await login.json()) as { accessToken: string }).accessToken;
}

// An authenticated request to the API. It does not throw on an error status:
// the caller decides which ones it expects.
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const accessToken = await apiLogin();
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${accessToken}` },
  });
}
