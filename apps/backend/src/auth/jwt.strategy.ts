import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import type { JwtPayload } from './auth.service.js';

export interface AuthenticatedUser {
  id: number;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // AuthModule refuses to load if JWT_SECRET is unset, so this is safe.
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  // Whatever this returns becomes `req.user` for protected routes. A
  // signature-valid, unexpired token for an Administrator that was since
  // deleted (e.g. a reseed in dev, or a deactivated account later on)
  // would otherwise pass auth and only fail downstream -- as a confusing
  // 500 -- the first time something tries to use that id as a foreign key
  // (e.g. tax_roll_imports.administratorId). Checking here turns that into
  // a clean 401, same as an expired token.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const admin = await this.prisma.administrator.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });
    if (!admin) {
      throw new UnauthorizedException('This session is no longer valid.');
    }
    return admin;
  }
}
