import type { CookieOptions, Request, Response } from 'express';

export const REFRESH_COOKIE_NAME = 'slomp_refresh';

type SameSite = 'strict' | 'lax' | 'none';

// The cookie only travels to the session endpoints (/auth/refresh and
// /auth/logout), never to the rest of the API. REFRESH_COOKIE_PATH covers a
// deployment that publishes the API under a prefix (for example /api/auth).
export function refreshCookieOptions(
  env: Record<string, string | undefined> = process.env,
): CookieOptions {
  const requested = env.REFRESH_COOKIE_SAMESITE?.toLowerCase();
  const sameSite: SameSite =
    requested === 'lax' || requested === 'none' ? requested : 'strict';
  return {
    httpOnly: true,
    // Browsers refuse SameSite=None without Secure, so "false" is ignored
    // there. It exists for environments still served over plain HTTP.
    secure: sameSite === 'none' || env.REFRESH_COOKIE_SECURE !== 'false',
    sameSite,
    path: env.REFRESH_COOKIE_PATH || '/auth',
  };
}

export function setRefreshCookie(
  response: Response,
  token: string,
  expires: Date,
): void {
  response.cookie(REFRESH_COOKIE_NAME, token, {
    ...refreshCookieOptions(),
    expires,
  });
}

export function clearRefreshCookie(response: Response): void {
  response.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}

export function readRefreshCookie(request: Request): string | null {
  for (const pair of (request.headers.cookie ?? '').split(';')) {
    const separator = pair.indexOf('=');
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() === REFRESH_COOKIE_NAME) {
      return pair.slice(separator + 1).trim() || null;
    }
  }
  return null;
}

export function allowedOrigins(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return (env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

// CSRF check for the endpoints that act on the cookie alone. Browsers always
// send Origin on a cross-origin POST; a request without it (curl, tests) does
// not come from a page and carries no ambient cookie to abuse.
export function isTrustedOrigin(
  request: Request,
  origins: string[] = allowedOrigins(),
): boolean {
  const origin = request.headers.origin;
  return origin === undefined || origins.includes(origin);
}
