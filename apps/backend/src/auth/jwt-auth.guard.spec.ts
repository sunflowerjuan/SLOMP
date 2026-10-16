import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertPasswordChangeNotPending } from './jwt-auth.guard.js';

describe('assertPasswordChangeNotPending', () => {
  it('lets an Administrator with their own password use any route', () => {
    expect(() =>
      assertPasswordChangeNotPending({ mustChangePassword: false }, false),
    ).not.toThrow();
  });

  it('blocks every other route while the password must be changed', () => {
    expect(() =>
      assertPasswordChangeNotPending({ mustChangePassword: true }, false),
    ).toThrow(ForbiddenException);
    try {
      assertPasswordChangeNotPending({ mustChangePassword: true }, false);
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        code: 'AUTH_PASSWORD_CHANGE_REQUIRED',
      });
    }
  });

  it('keeps the password change route open while it must be changed', () => {
    expect(() =>
      assertPasswordChangeNotPending({ mustChangePassword: true }, true),
    ).not.toThrow();
  });
});
