import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import {
  LoginAttemptTracker,
  loginAttemptKeys,
} from './login-attempt-tracker.js';

// Compared against when no admin matches the email, so a login attempt for
// an unknown address takes the same time as a wrong-password one. Generated
// at startup (not a literal) so no bcrypt-hash-shaped string — which secret
// scanners flag as a leaked credential — sits in the source; it isn't a
// real password for any account either way.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export interface JwtPayload {
  sub: number;
  email: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly loginAttempts: LoginAttemptTracker,
  ) {}

  async login(
    email: string,
    password: string,
    ip: string,
  ): Promise<{ accessToken: string }> {
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
    const payload: JwtPayload = { sub: admin.id, email: admin.email };
    return { accessToken: await this.jwtService.signAsync(payload) };
  }
}
