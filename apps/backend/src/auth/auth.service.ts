import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import {
  LoginAttemptTracker,
  loginAttemptKeys,
} from './login-attempt-tracker.js';
import { SessionService } from './session.service.js';
import type { IssuedSession } from './session.service.js';
import type { AuthenticatedUser } from './jwt.strategy.js';
import { checkPasswordPolicy } from './password-policy.js';
import type { PasswordPolicyViolation } from './password-policy.js';

// Compared against when no admin matches the email, so a login attempt for
// an unknown address takes the same time as a wrong-password one. Generated
// at startup (not a literal) so no bcrypt-hash-shaped string — which secret
// scanners flag as a leaked credential — sits in the source; it isn't a
// real password for any account either way.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

// Same cost as the seed and the admin scripts.
const BCRYPT_SALT_ROUNDS = 10;

export type PasswordChangeViolation =
  PasswordPolicyViolation | 'SAME_AS_CURRENT';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly loginAttempts: LoginAttemptTracker,
  ) {}

  async login(
    email: string,
    password: string,
    ip: string,
  ): Promise<IssuedSession> {
    const attemptKeys = loginAttemptKeys(email, ip);
    const locked = this.loginAttempts.isLocked(attemptKeys);

    const admin = await this.prisma.administrator.findUnique({
      where: { email },
    });
    const passwordMatches = await bcrypt.compare(
      password,
      admin?.passwordHash ?? DUMMY_HASH,
    );

    // A locked-out attempt runs the same lookup and hash comparison and gets
    // the same answer as a wrong password, so the response reveals neither
    // the lockout nor whether the account exists. It isn't counted again:
    // hammering a locked account must not keep it locked forever.
    if (locked || !admin || !passwordMatches) {
      if (!locked) this.loginAttempts.registerFailure(attemptKeys);
      throw new UnauthorizedException(
        errorBody(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid credentials.'),
      );
    }

    this.loginAttempts.registerSuccess(attemptKeys);
    return this.sessions.start(admin);
  }

  // Renews the session behind a refresh token, rotating it.
  async refresh(refreshToken: string | null): Promise<IssuedSession> {
    const session = refreshToken
      ? await this.sessions.rotate(refreshToken)
      : null;
    if (!session) {
      throw new UnauthorizedException(
        errorBody(
          ErrorCode.AUTH_SESSION_INVALID,
          'This session is no longer valid.',
        ),
      );
    }
    return session;
  }

  async logout(refreshToken: string | null): Promise<void> {
    if (refreshToken) await this.sessions.revoke(refreshToken);
  }

  // Replaces the Administrator's password and clears mustChangePassword.
  // The current password is required even right after login, so an
  // unattended open panel isn't enough to take over the account; a wrong one
  // counts towards the same lockout as a failed login. Every other session
  // of the account is closed; the one making the change stays open.
  async changePassword(
    user: AuthenticatedUser,
    currentPassword: string,
    newPassword: string,
    ip: string,
  ): Promise<void> {
    const attemptKeys = loginAttemptKeys(user.email, ip);
    const locked = this.loginAttempts.isLocked(attemptKeys);

    const admin = await this.prisma.administrator.findUnique({
      where: { id: user.id },
    });
    if (!admin) {
      throw new UnauthorizedException(
        errorBody(
          ErrorCode.AUTH_SESSION_INVALID,
          'This session is no longer valid.',
        ),
      );
    }

    const currentMatches = await bcrypt.compare(
      currentPassword,
      admin.passwordHash,
    );
    if (locked || !currentMatches) {
      if (!locked) this.loginAttempts.registerFailure(attemptKeys);
      // 400, not 401: the session is fine, and a 401 would make the panel
      // try to renew it.
      throw new BadRequestException(
        errorBody(
          ErrorCode.AUTH_CURRENT_PASSWORD_INVALID,
          'The current password is not correct.',
        ),
      );
    }
    this.loginAttempts.registerSuccess(attemptKeys);

    const violations: PasswordChangeViolation[] =
      checkPasswordPolicy(newPassword);
    if (await bcrypt.compare(newPassword, admin.passwordHash)) {
      violations.push('SAME_AS_CURRENT');
    }
    if (violations.length > 0) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.AUTH_PASSWORD_POLICY_VIOLATION,
          `The new password does not meet the password policy: ${violations.join(', ')}.`,
          { violations },
        ),
      );
    }

    await this.prisma.$transaction([
      this.prisma.administrator.update({
        where: { id: admin.id },
        data: {
          passwordHash: await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS),
          mustChangePassword: false,
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          administratorId: admin.id,
          revokedAt: null,
          familyId: { not: user.sessionId },
        },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
}
