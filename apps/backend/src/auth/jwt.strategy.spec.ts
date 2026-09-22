import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { JwtStrategy } from './jwt.strategy.js';

const ADMIN = { id: 1, email: 'admin@example.com' };

function buildStrategy(admin: typeof ADMIN | null) {
  process.env.JWT_SECRET ??= 'test-secret';
  const prisma = {
    administrator: {
      findUnique: async () => admin,
    },
  };
  return new JwtStrategy(prisma as never);
}

describe('JwtStrategy', () => {
  it('resolves the Administrator for a token whose subject still exists', async () => {
    const user = await buildStrategy(ADMIN).validate({
      sub: ADMIN.id,
      email: ADMIN.email,
    });

    expect(user).toEqual(ADMIN);
  });

  it('rejects a token for an Administrator that no longer exists (e.g. deleted since the token was issued)', async () => {
    await expect(
      buildStrategy(null).validate({ sub: 999, email: 'gone@example.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
