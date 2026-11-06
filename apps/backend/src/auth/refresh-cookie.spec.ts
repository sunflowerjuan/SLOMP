import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import {
  allowedOrigins,
  isTrustedOrigin,
  readRefreshCookie,
  refreshCookieOptions,
} from './refresh-cookie.js';

function requestWith(headers: Record<string, string>): Request {
  return { headers } as Request;
}

describe('refreshCookieOptions', () => {
  it('defaults to httpOnly, Secure, SameSite=Strict, limited to /auth', () => {
    expect(refreshCookieOptions({})).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/auth',
    });
  });

  it('allows dropping Secure only where the API is served over plain HTTP', () => {
    expect(
      refreshCookieOptions({ REFRESH_COOKIE_SECURE: 'false' }).secure,
    ).toBe(false);
  });

  it('keeps Secure with SameSite=None, which browsers require', () => {
    expect(
      refreshCookieOptions({
        REFRESH_COOKIE_SAMESITE: 'None',
        REFRESH_COOKIE_SECURE: 'false',
      }),
    ).toMatchObject({ sameSite: 'none', secure: true });
  });

  it('falls back to Strict on an unknown SameSite value', () => {
    expect(
      refreshCookieOptions({ REFRESH_COOKIE_SAMESITE: 'whatever' }).sameSite,
    ).toBe('strict');
  });

  it('takes the path from REFRESH_COOKIE_PATH', () => {
    expect(
      refreshCookieOptions({ REFRESH_COOKIE_PATH: '/api/auth' }).path,
    ).toBe('/api/auth');
  });
});

describe('readRefreshCookie', () => {
  it('finds the refresh token among other cookies', () => {
    expect(
      readRefreshCookie(
        requestWith({ cookie: 'theme=dark; slomp_refresh=abc-123_x; other=1' }),
      ),
    ).toBe('abc-123_x');
  });

  it('returns null when the cookie is missing or empty', () => {
    expect(readRefreshCookie(requestWith({}))).toBeNull();
    expect(readRefreshCookie(requestWith({ cookie: 'theme=dark' }))).toBeNull();
    expect(
      readRefreshCookie(requestWith({ cookie: 'slomp_refresh=' })),
    ).toBeNull();
  });
});

describe('isTrustedOrigin', () => {
  const origins = allowedOrigins({
    CORS_ORIGIN: 'https://panel.example.com, http://localhost:5173',
  });

  it('accepts the origins listed in CORS_ORIGIN', () => {
    expect(origins).toEqual([
      'https://panel.example.com',
      'http://localhost:5173',
    ]);
    expect(
      isTrustedOrigin(
        requestWith({ origin: 'https://panel.example.com' }),
        origins,
      ),
    ).toBe(true);
  });

  it('rejects any other origin', () => {
    expect(
      isTrustedOrigin(requestWith({ origin: 'https://evil.example' }), origins),
    ).toBe(false);
  });

  it('accepts a request without Origin (not sent by a page)', () => {
    expect(isTrustedOrigin(requestWith({}), origins)).toBe(true);
  });
});
