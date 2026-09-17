import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { describe, expect, it } from 'vitest';
import { AuthService } from './auth.service.js';

const PASSWORD = 'correct-password';
const ADMIN = {
  id: 1,
  email: 'admin@example.com',
  passwordHash: bcrypt.hashSync(PASSWORD, 4),
};

function buildService(admin: typeof ADMIN | null) {
  const prisma = { administrator: { findUnique: async () => admin } };
  const jwtService = new JwtService({ secret: 'test-secret' });
  return new AuthService(prisma as never, jwtService);
}

describe('AuthService', () => {
  it('issues a JWT for the right email/password', async () => {
    const { accessToken } = await buildService(ADMIN).login(
      ADMIN.email,
      PASSWORD,
    );

    expect(typeof accessToken).toBe('string');
    expect(accessToken.split('.')).toHaveLength(3);
  });

  it('rejects a wrong password', async () => {
    await expect(
      buildService(ADMIN).login(ADMIN.email, 'wrong'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown email', async () => {
    await expect(
      buildService(null).login('nobody@example.com', PASSWORD),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
