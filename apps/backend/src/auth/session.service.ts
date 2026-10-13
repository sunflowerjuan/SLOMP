import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  accessTokenExpiry,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
} from './session-policy.js';
import type { SessionPolicy } from './session-policy.js';

export interface JwtPayload {
  sub: number;
  email: string;
  // Session id: the family of refresh tokens this access token belongs to.
  sid: string;
}

export interface IssuedSession {
  accessToken: string;
  // Seconds until the access token expires.
  expiresIn: number;
  // Seconds without activity after which the panel closes the session.
  idleTimeoutSeconds: number;
  // ISO date of the absolute end of the session.
  sessionExpiresAt: string;
  // Never part of a response body: it only travels in the httpOnly cookie.
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

interface SessionOwner {
  id: number;
  email: string;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly policy: SessionPolicy,
    private readonly now: () => number = Date.now,
  ) {}

  // Opens a session after a successful login.
  async start(admin: SessionOwner): Promise<IssuedSession> {
    const now = this.now();
    // Rows past their expiry are no longer needed, not even to detect reuse.
    await this.prisma.refreshToken.deleteMany({
      where: { administratorId: admin.id, expiresAt: { lt: new Date(now) } },
    });
    return this.issue(
      this.prisma,
      admin,
      randomUUID(),
      now,
      now + this.policy.maxSessionMs,
    );
  }

  // Exchanges a refresh token for a new pair. Returns null when the token is
  // unknown, expired or revoked. Presenting a token that was already rotated
  // means two parties hold it, so the whole session is closed.
  async rotate(refreshToken: string): Promise<IssuedSession | null> {
    const now = this.now();
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.refreshToken.findUnique({
        where: { tokenHash: hashRefreshToken(refreshToken) },
        include: { administrator: { select: { id: true, email: true } } },
      });
      if (!current) return null;

      if (current.revokedAt) {
        await this.revokeFamily(tx, current.familyId, now);
        return null;
      }
      if (current.expiresAt.getTime() <= now) return null;

      // Conditional on still being live, so two simultaneous refreshes with
      // the same token cannot both succeed.
      const claimed = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: new Date(now) },
      });
      if (claimed.count !== 1) {
        await this.revokeFamily(tx, current.familyId, now);
        return null;
      }

      return this.issue(
        tx,
        current.administrator,
        current.familyId,
        now,
        current.sessionExpiresAt.getTime(),
      );
    });
  }

  // Logout: closes the session the refresh token belongs to.
  async revoke(refreshToken: string): Promise<void> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
      select: { familyId: true },
    });
    if (current) {
      await this.revokeFamily(this.prisma, current.familyId, this.now());
    }
  }

  // The Administrator behind an access token, or null once its session was
  // closed (logout, reuse detected, expired) or the account was deleted.
  async findActiveOwner(
    payload: Pick<JwtPayload, 'sub' | 'sid'>,
  ): Promise<SessionOwner | null> {
    if (typeof payload.sid !== 'string') return null;
    const live = await this.prisma.refreshToken.findFirst({
      where: {
        familyId: payload.sid,
        administratorId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date(this.now()) },
      },
      select: { administrator: { select: { id: true, email: true } } },
    });
    return live?.administrator ?? null;
  }

  private async issue(
    db: Pick<PrismaService, 'refreshToken'>,
    admin: SessionOwner,
    familyId: string,
    now: number,
    sessionExpiresAt: number,
  ): Promise<IssuedSession> {
    const refreshToken = generateRefreshToken();
    const refreshTokenExpiresAt = new Date(
      refreshTokenExpiry(this.policy, now, sessionExpiresAt),
    );
    await db.refreshToken.create({
      data: {
        tokenHash: hashRefreshToken(refreshToken),
        familyId,
        administratorId: admin.id,
        expiresAt: refreshTokenExpiresAt,
        sessionExpiresAt: new Date(sessionExpiresAt),
      },
    });

    const expiresIn = Math.max(
      1,
      Math.floor(
        (accessTokenExpiry(this.policy, now, sessionExpiresAt) - now) / 1000,
      ),
    );
    const payload: JwtPayload = {
      sub: admin.id,
      email: admin.email,
      sid: familyId,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload, { expiresIn }),
      expiresIn,
      idleTimeoutSeconds: Math.floor(this.policy.idleTimeoutMs / 1000),
      sessionExpiresAt: new Date(sessionExpiresAt).toISOString(),
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private async revokeFamily(
    db: Pick<PrismaService, 'refreshToken'>,
    familyId: string,
    now: number,
  ): Promise<void> {
    await db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(now) },
    });
  }
}
