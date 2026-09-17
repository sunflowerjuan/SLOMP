import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service.js';

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
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string }> {
    const admin = await this.prisma.administrator.findUnique({
      where: { email },
    });
    const passwordMatches = await bcrypt.compare(
      password,
      admin?.passwordHash ?? DUMMY_HASH,
    );

    if (!admin || !passwordMatches) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const payload: JwtPayload = { sub: admin.id, email: admin.email };
    return { accessToken: await this.jwtService.signAsync(payload) };
  }
}
