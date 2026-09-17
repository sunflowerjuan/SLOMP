import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from './auth.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // AuthModule refuses to load if JWT_SECRET is unset, so this is safe.
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  // Whatever this returns becomes `req.user` for protected routes.
  validate(payload: JwtPayload) {
    return { id: payload.sub, email: payload.email };
  }
}
