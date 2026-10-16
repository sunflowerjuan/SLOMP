import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { SessionService } from './session.service.js';
import type { JwtPayload } from './session.service.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';

export interface AuthenticatedUser {
  id: number;
  email: string;
  mustChangePassword: boolean;
  // Session (refresh token family) the access token belongs to.
  sessionId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly sessions: SessionService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      // AuthModule refuses to load if JWT_SECRET is unset, so this is safe.
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  // Whatever this returns becomes `req.user` for protected routes. A
  // signature-valid, unexpired token is still rejected once its session was
  // closed (logout, refresh token reuse) or its Administrator was deleted
  // (e.g. a reseed in dev), so a stolen token stops working at logout and a
  // stale one fails as a clean 401 instead of a 500 further down, the first
  // time something uses that id as a foreign key.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const admin = await this.sessions.findActiveOwner(payload);
    if (!admin) {
      throw new UnauthorizedException(
        errorBody(
          ErrorCode.AUTH_SESSION_INVALID,
          'This session is no longer valid.',
        ),
      );
    }
    return { ...admin, sessionId: payload.sid };
  }
}
