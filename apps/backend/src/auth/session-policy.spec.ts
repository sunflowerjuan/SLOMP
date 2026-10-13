import { describe, expect, it } from 'vitest';
import {
  accessTokenExpiry,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  sessionPolicyFromEnv,
} from './session-policy.js';

const MINUTE = 60_000;
const POLICY = sessionPolicyFromEnv({});

describe('sessionPolicyFromEnv', () => {
  it('defaults to the times of the security policy', () => {
    expect(POLICY).toEqual({
      accessTokenTtlMs: 15 * MINUTE,
      idleTimeoutMs: 30 * MINUTE,
      maxSessionMs: 8 * 60 * MINUTE,
    });
  });

  it('takes each time from its environment variable', () => {
    expect(
      sessionPolicyFromEnv({
        ACCESS_TOKEN_TTL_MINUTES: '5',
        SESSION_IDLE_TIMEOUT_MINUTES: '10',
        SESSION_MAX_HOURS: '1',
      }),
    ).toEqual({
      accessTokenTtlMs: 5 * MINUTE,
      idleTimeoutMs: 10 * MINUTE,
      maxSessionMs: 60 * MINUTE,
    });
  });

  it('ignores values that are not a positive number', () => {
    expect(
      sessionPolicyFromEnv({
        ACCESS_TOKEN_TTL_MINUTES: '0',
        SESSION_IDLE_TIMEOUT_MINUTES: 'soon',
        SESSION_MAX_HOURS: '-2',
      }),
    ).toEqual(POLICY);
  });
});

describe('token expiry', () => {
  const now = 1_000_000;

  it('gives each token its own lifetime while the session has time left', () => {
    const sessionExpiresAt = now + POLICY.maxSessionMs;
    expect(accessTokenExpiry(POLICY, now, sessionExpiresAt)).toBe(
      now + 15 * MINUTE,
    );
    expect(refreshTokenExpiry(POLICY, now, sessionExpiresAt)).toBe(
      now + 30 * MINUTE,
    );
  });

  it('never lets a token outlive the session', () => {
    const sessionExpiresAt = now + 4 * MINUTE;
    expect(accessTokenExpiry(POLICY, now, sessionExpiresAt)).toBe(
      sessionExpiresAt,
    );
    expect(refreshTokenExpiry(POLICY, now, sessionExpiresAt)).toBe(
      sessionExpiresAt,
    );
  });
});

describe('refresh tokens', () => {
  it('are random and long enough not to be guessed', () => {
    const first = generateRefreshToken();
    expect(first).not.toBe(generateRefreshToken());
    expect(Buffer.from(first, 'base64url')).toHaveLength(32);
  });

  it('are stored as a hash that does not contain the token', () => {
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashRefreshToken(token));
    expect(hash).not.toContain(token);
  });
});
