import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { hashRefreshToken, sessionPolicyFromEnv } from './session-policy.js';
import { SessionService } from './session.service.js';
import type { JwtPayload } from './session.service.js';

const MINUTE = 60_000;
const POLICY = sessionPolicyFromEnv({});
const ADMIN = { id: 1, email: 'admin@example.com' };
const START = Date.UTC(2026, 9, 13, 14, 0, 0);

interface Row {
  id: number;
  tokenHash: string;
  familyId: string;
  administratorId: number;
  expiresAt: Date;
  sessionExpiresAt: Date;
  revokedAt: Date | null;
}

// Minimal in-memory stand-in for the refresh_tokens table: just the calls
// SessionService makes.
function buildFakePrisma(admins: (typeof ADMIN)[]) {
  const rows: Row[] = [];
  const withAdmin = (row: Row | undefined) =>
    row && {
      ...row,
      administrator: admins.find((admin) => admin.id === row.administratorId),
    };
  const refreshToken = {
    create: async ({ data }: { data: Omit<Row, 'id' | 'revokedAt'> }) => {
      const row = { ...data, id: rows.length + 1, revokedAt: null };
      rows.push(row);
      return row;
    },
    findUnique: async ({ where }: { where: { tokenHash: string } }) =>
      withAdmin(rows.find((row) => row.tokenHash === where.tokenHash)) ?? null,
    findFirst: async ({
      where,
    }: {
      where: {
        familyId: string;
        administratorId: number;
        expiresAt: { gt: Date };
      };
    }) =>
      withAdmin(
        rows.find(
          (row) =>
            row.familyId === where.familyId &&
            row.administratorId === where.administratorId &&
            row.revokedAt === null &&
            row.expiresAt > where.expiresAt.gt &&
            // The real table cascades on delete of the Administrator.
            admins.some((admin) => admin.id === row.administratorId),
        ),
      ) ?? null,
    updateMany: async ({
      where,
      data,
    }: {
      where: { id?: number; familyId?: string };
      data: { revokedAt: Date };
    }) => {
      const matches = rows.filter(
        (row) =>
          row.revokedAt === null &&
          (where.id === undefined || row.id === where.id) &&
          (where.familyId === undefined || row.familyId === where.familyId),
      );
      for (const row of matches) row.revokedAt = data.revokedAt;
      return { count: matches.length };
    },
    deleteMany: async ({
      where,
    }: {
      where: { administratorId: number; expiresAt: { lt: Date } };
    }) => {
      const kept = rows.filter(
        (row) =>
          row.administratorId !== where.administratorId ||
          row.expiresAt >= where.expiresAt.lt,
      );
      const count = rows.length - kept.length;
      rows.splice(0, rows.length, ...kept);
      return { count };
    },
  };
  const prisma = {
    refreshToken,
    $transaction: async <T>(run: (tx: unknown) => Promise<T>) => run(prisma),
  };
  return { prisma, rows };
}

function buildService(admins = [ADMIN]) {
  const clock = { now: START };
  const { prisma, rows } = buildFakePrisma(admins);
  const jwtService = new JwtService({ secret: 'test-secret' });
  const service = new SessionService(
    prisma as never,
    jwtService,
    POLICY,
    () => clock.now,
  );
  const payloadOf = (accessToken: string) =>
    jwtService.decode<JwtPayload & { iat: number; exp: number }>(accessToken);
  return { service, rows, clock, payloadOf };
}

describe('SessionService', () => {
  it('opens a session with a short access token and a hashed refresh token', async () => {
    const { service, rows, payloadOf } = buildService();

    const session = await service.start(ADMIN);

    const payload = payloadOf(session.accessToken);
    expect(payload).toMatchObject({ sub: ADMIN.id, email: ADMIN.email });
    expect(payload.exp - payload.iat).toBe(15 * 60);
    expect(session.expiresIn).toBe(15 * 60);
    expect(session.idleTimeoutSeconds).toBe(30 * 60);
    expect(session.sessionExpiresAt).toBe(
      new Date(START + 8 * 60 * MINUTE).toISOString(),
    );
    expect(session.refreshTokenExpiresAt).toEqual(
      new Date(START + 30 * MINUTE),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(hashRefreshToken(session.refreshToken));
    expect(rows[0].familyId).toBe(payload.sid);
  });

  it('rotates the refresh token: a new one in the same session, the old one revoked', async () => {
    const { service, rows, clock, payloadOf } = buildService();
    const first = await service.start(ADMIN);

    clock.now += 10 * MINUTE;
    const second = await service.rotate(first.refreshToken);

    expect(second).not.toBeNull();
    expect(second!.refreshToken).not.toBe(first.refreshToken);
    expect(payloadOf(second!.accessToken).sid).toBe(
      payloadOf(first.accessToken).sid,
    );
    expect(second!.refreshTokenExpiresAt).toEqual(
      new Date(START + 40 * MINUTE),
    );
    expect(second!.sessionExpiresAt).toBe(first.sessionExpiresAt);
    expect(rows.map((row) => row.revokedAt !== null)).toEqual([true, false]);
  });

  it('closes the whole session when an already-rotated token shows up again', async () => {
    const { service, payloadOf } = buildService();
    const first = await service.start(ADMIN);
    const second = await service.rotate(first.refreshToken);

    expect(await service.rotate(first.refreshToken)).toBeNull();

    expect(await service.rotate(second!.refreshToken)).toBeNull();
    expect(
      await service.findActiveOwner(payloadOf(second!.accessToken)),
    ).toBeNull();
  });

  it('rejects an unknown refresh token', async () => {
    const { service } = buildService();
    await service.start(ADMIN);

    expect(await service.rotate('not-a-real-token')).toBeNull();
  });

  it('rejects a refresh after the idle limit', async () => {
    const { service, clock } = buildService();
    const session = await service.start(ADMIN);

    clock.now += 30 * MINUTE;

    expect(await service.rotate(session.refreshToken)).toBeNull();
  });

  it('ends the session at its absolute limit even when it kept renewing', async () => {
    const { service, clock } = buildService();
    let session = await service.start(ADMIN);

    // Renew every 20 minutes for 7 h 40 min.
    for (let renewals = 0; renewals < 23; renewals += 1) {
      clock.now += 20 * MINUTE;
      session = (await service.rotate(session.refreshToken))!;
    }
    expect(session.expiresIn).toBe(15 * 60);

    clock.now += 15 * MINUTE;
    session = (await service.rotate(session.refreshToken))!;
    // 5 minutes left: neither token goes past the end of the session.
    expect(session.expiresIn).toBe(5 * 60);
    expect(session.refreshTokenExpiresAt.toISOString()).toBe(
      session.sessionExpiresAt,
    );

    clock.now += 5 * MINUTE;
    expect(await service.rotate(session.refreshToken)).toBeNull();
  });

  it('logout revokes the session, so its access token stops being accepted', async () => {
    const { service, payloadOf } = buildService();
    const session = await service.start(ADMIN);
    const payload = payloadOf(session.accessToken);
    expect(await service.findActiveOwner(payload)).toEqual(ADMIN);

    await service.revoke(session.refreshToken);

    expect(await service.findActiveOwner(payload)).toBeNull();
    expect(await service.rotate(session.refreshToken)).toBeNull();
  });

  it('logout of one session leaves the others open', async () => {
    const { service, payloadOf } = buildService();
    const laptop = await service.start(ADMIN);
    const desktop = await service.start(ADMIN);

    await service.revoke(laptop.refreshToken);

    expect(
      await service.findActiveOwner(payloadOf(desktop.accessToken)),
    ).toEqual(ADMIN);
  });

  it('does not accept an access token without a session id (issued before sessions existed)', async () => {
    const { service } = buildService();
    await service.start(ADMIN);

    expect(
      await service.findActiveOwner({ sub: ADMIN.id } as never),
    ).toBeNull();
  });

  it('does not accept a session whose Administrator no longer exists', async () => {
    const admins = [ADMIN];
    const { service, payloadOf } = buildService(admins);
    const session = await service.start(ADMIN);

    admins.length = 0;

    expect(
      await service.findActiveOwner(payloadOf(session.accessToken)),
    ).toBeNull();
  });

  it('drops expired rows of the Administrator on the next login', async () => {
    const { service, rows, clock } = buildService();
    await service.start(ADMIN);

    clock.now += 31 * MINUTE;
    await service.start(ADMIN);

    expect(rows).toHaveLength(1);
  });
});
