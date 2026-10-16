import { BadRequestException, UnauthorizedException } from '@nestjs/common';
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

describe('AuthService.changePassword', () => {
  const NEW_PASSWORD = 'una frase larga que nadie conoce';
  const USER = {
    id: ADMIN.id,
    email: ADMIN.email,
    mustChangePassword: true,
    sessionId: 'current-session',
  };

  function buildForChange() {
    const state = {
      admin: { ...ADMIN, mustChangePassword: true },
      revokedWhere: null as unknown,
    };
    const prisma = {
      administrator: {
        findUnique: async () => state.admin,
        update: async ({ data }: { data: Partial<typeof state.admin> }) =>
          Object.assign(state.admin, data),
      },
      refreshToken: {
        updateMany: async ({ where }: { where: unknown }) => {
          state.revokedWhere = where;
          return { count: 2 };
        },
      },
      $transaction: async (operations: Promise<unknown>[]) =>
        Promise.all(operations),
    };
    const service = new AuthService(
      prisma as never,
      {} as never,
      new LoginAttemptTracker(),
    );
    return { service, state };
  }

  it('stores the new password, clears the flag and closes only the other sessions', async () => {
    const { service, state } = buildForChange();

    await service.changePassword(USER, PASSWORD, NEW_PASSWORD, IP);

    expect(state.admin.mustChangePassword).toBe(false);
    expect(bcrypt.compareSync(NEW_PASSWORD, state.admin.passwordHash)).toBe(
      true,
    );
    expect(state.revokedWhere).toEqual({
      administratorId: ADMIN.id,
      revokedAt: null,
      familyId: { not: 'current-session' },
    });
  });

  it('rejects a wrong current password with 400, leaving everything as it was', async () => {
    const { service, state } = buildForChange();

    await expect(
      service.changePassword(USER, 'wrong', NEW_PASSWORD, IP),
    ).rejects.toMatchObject({
      status: 400,
      response: { code: 'AUTH_CURRENT_PASSWORD_INVALID' },
    });
    expect(state.admin.mustChangePassword).toBe(true);
    expect(state.revokedWhere).toBeNull();
  });

  it('reports every policy violation of the new password', async () => {
    const { service } = buildForChange();

    await expect(
      service.changePassword(USER, PASSWORD, 'changeme123', IP),
    ).rejects.toMatchObject({
      status: 400,
      response: {
        code: 'AUTH_PASSWORD_POLICY_VIOLATION',
        details: { violations: ['TOO_SHORT', 'COMMON'] },
      },
    });
  });

  it('rejects keeping the same password', async () => {
    const { service } = buildForChange();

    await expect(
      service.changePassword(USER, PASSWORD, PASSWORD, IP),
    ).rejects.toMatchObject({
      response: { details: { violations: ['SAME_AS_CURRENT'] } },
    });
  });

  it('counts wrong current passwords towards the login lockout', async () => {
    const { service } = buildForChange();
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      await expect(
        service.changePassword(USER, 'wrong', NEW_PASSWORD, IP),
      ).rejects.toBeInstanceOf(BadRequestException);
    }

    await expect(
      service.changePassword(USER, PASSWORD, NEW_PASSWORD, IP),
    ).rejects.toMatchObject({
      response: { code: 'AUTH_CURRENT_PASSWORD_INVALID' },
    });
  });
});
