import { UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service.js';
import {
  LoginAttemptTracker,
  MAX_FAILED_ATTEMPTS,
} from './login-attempt-tracker.js';

const PASSWORD = 'correct-password';
const IP = '198.51.100.1';
const ADMIN = {
  id: 1,
  email: 'admin@example.com',
  passwordHash: bcrypt.hashSync(PASSWORD, 4),
};

const SESSION = { accessToken: 'header.payload.signature', refreshToken: 'r1' };

function buildService(admin: typeof ADMIN | null, revoked: string[] = []) {
  const prisma = { administrator: { findUnique: async () => admin } };
  const sessions = {
    start: async (owner: { id: number }) => ({ ...SESSION, ownerId: owner.id }),
    rotate: async (refreshToken: string) =>
      refreshToken === SESSION.refreshToken ? SESSION : null,
    revoke: async (refreshToken: string) => {
      revoked.push(refreshToken);
    },
  };
  return new AuthService(
    prisma as never,
    sessions as never,
    new LoginAttemptTracker(),
  );
}

describe('AuthService', () => {
  it('opens a session for the right email/password', async () => {
    const session = await buildService(ADMIN).login(ADMIN.email, PASSWORD, IP);

    expect(session).toMatchObject({ ...SESSION, ownerId: ADMIN.id });
  });

  it('renews the session behind a valid refresh token', async () => {
    await expect(
      buildService(ADMIN).refresh(SESSION.refreshToken),
    ).resolves.toBe(SESSION);
  });

  it('rejects a refresh without a token or with one that is not valid', async () => {
    const service = buildService(ADMIN);

    await expect(service.refresh(null)).rejects.toMatchObject({
      response: { code: 'AUTH_SESSION_INVALID' },
    });
    await expect(service.refresh('stale')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes the session on logout, and tolerates a logout without one', async () => {
    const revoked: string[] = [];
    const service = buildService(ADMIN, revoked);

    await service.logout(null);
    await service.logout('r1');

    expect(revoked).toEqual(['r1']);
  });

  it('rejects a wrong password', async () => {
    await expect(
      buildService(ADMIN).login(ADMIN.email, 'wrong', IP),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown email', async () => {
    await expect(
      buildService(null).login('nobody@example.com', PASSWORD, IP),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  async function failLogin(service: AuthService, email: string, ip: string) {
    await expect(service.login(email, 'wrong', ip)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  }

  it('rejects even the right password once the email is locked out', async () => {
    const service = buildService(ADMIN);
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      await failLogin(service, ADMIN.email, `203.0.113.${attempt}`);
    }

    await expect(
      service.login(ADMIN.email, PASSWORD, IP),
    ).rejects.toMatchObject({
      response: { code: 'AUTH_INVALID_CREDENTIALS' },
    });
  });

  it('rejects every account from an IP that is locked out', async () => {
    const service = buildService(ADMIN);
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      await failLogin(service, `nobody${attempt}@example.com`, IP);
    }

    await expect(
      service.login(ADMIN.email, PASSWORD, IP),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.login(ADMIN.email, PASSWORD, '203.0.113.9'),
    ).resolves.toHaveProperty('accessToken');
  });

  it('starts counting again after a successful login', async () => {
    const service = buildService(ADMIN);
    for (let round = 0; round < 2; round += 1) {
      for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS - 1; attempt += 1) {
        await failLogin(service, ADMIN.email, IP);
      }
      await service.login(ADMIN.email, PASSWORD, IP);
    }
  });
});
