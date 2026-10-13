import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { JwtStrategy } from './jwt.strategy.js';

const ADMIN = { id: 1, email: 'admin@example.com' };
const PAYLOAD = { sub: ADMIN.id, email: ADMIN.email, sid: 'session-1' };

function buildStrategy(owner: typeof ADMIN | null) {
  process.env.JWT_SECRET ??= 'test-secret';
  const sessions = { findActiveOwner: async () => owner };
  return new JwtStrategy(sessions as never);
}

describe('JwtStrategy', () => {
  it('resolves the Administrator for a token whose session is still open', async () => {
    expect(await buildStrategy(ADMIN).validate(PAYLOAD)).toEqual(ADMIN);
  });

  it('rejects a token whose session was closed or whose Administrator no longer exists', async () => {
    await expect(buildStrategy(null).validate(PAYLOAD)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
