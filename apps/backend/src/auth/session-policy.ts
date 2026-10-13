import { createHash, randomBytes } from 'node:crypto';

// Session lifetimes from the security policy (section 2). The team has not
// signed off the exact times yet, so each one can be overridden by
// environment variable without touching code.
export interface SessionPolicy {
  // Lifetime of the access token (JWT).
  accessTokenTtlMs: number;
  // Lifetime of a refresh token: a session nobody renews for this long ends.
  idleTimeoutMs: number;
  // Absolute lifetime of a session, counted from the login.
  maxSessionMs: number;
}

export const DEFAULT_ACCESS_TOKEN_TTL_MINUTES = 15;
export const DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES = 30;
export const DEFAULT_SESSION_MAX_HOURS = 8;

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function sessionPolicyFromEnv(
  env: Record<string, string | undefined> = process.env,
): SessionPolicy {
  return {
    accessTokenTtlMs:
      positiveNumber(
        env.ACCESS_TOKEN_TTL_MINUTES,
        DEFAULT_ACCESS_TOKEN_TTL_MINUTES,
      ) * 60_000,
    idleTimeoutMs:
      positiveNumber(
        env.SESSION_IDLE_TIMEOUT_MINUTES,
        DEFAULT_SESSION_IDLE_TIMEOUT_MINUTES,
      ) * 60_000,
    maxSessionMs:
      positiveNumber(env.SESSION_MAX_HOURS, DEFAULT_SESSION_MAX_HOURS) *
      3_600_000,
  };
}

// Neither token outlives the session it belongs to.
export function refreshTokenExpiry(
  policy: SessionPolicy,
  now: number,
  sessionExpiresAt: number,
): number {
  return Math.min(now + policy.idleTimeoutMs, sessionExpiresAt);
}

export function accessTokenExpiry(
  policy: SessionPolicy,
  now: number,
  sessionExpiresAt: number,
): number {
  return Math.min(now + policy.accessTokenTtlMs, sessionExpiresAt);
}

// Opaque refresh token: 256 random bits, sent to the browser only as a cookie.
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

// What the database keeps instead of the token. A fast hash is enough: the
// token is random, not a password someone could guess.
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
