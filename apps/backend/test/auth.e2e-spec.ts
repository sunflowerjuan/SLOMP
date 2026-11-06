import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { MAX_FAILED_ATTEMPTS } from './../src/auth/login-attempt-tracker.js';

const SEEDED_ADMIN_EMAIL =
  process.env.SEED_ADMIN_EMAIL ?? 'admin@paez-boyaca.gov.co';
const SEEDED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('logs the seeded administrator in and returns a JWT', async () => {
    const response = await request(app.getHttpServer())
      .post('/login')
      .send({ email: SEEDED_ADMIN_EMAIL, password: SEEDED_ADMIN_PASSWORD })
      .expect(201);

    expect(typeof response.body.accessToken).toBe('string');
  });

  it('rejects a wrong password with 401', async () => {
    await request(app.getHttpServer())
      .post('/login')
      .send({ email: SEEDED_ADMIN_EMAIL, password: 'wrong-password' })
      .expect(401);
  });

  it('locks the login after repeated failures, answering like a wrong password', async () => {
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      await request(app.getHttpServer())
        .post('/login')
        .send({ email: SEEDED_ADMIN_EMAIL, password: 'wrong-password' })
        .expect(401);
    }

    const response = await request(app.getHttpServer())
      .post('/login')
      .send({ email: SEEDED_ADMIN_EMAIL, password: SEEDED_ADMIN_PASSWORD })
      .expect(401);

    expect(response.body.code).toBe('AUTH_INVALID_CREDENTIALS');
  });

  function login() {
    return request(app.getHttpServer())
      .post('/login')
      .send({ email: SEEDED_ADMIN_EMAIL, password: SEEDED_ADMIN_PASSWORD })
      .expect(201);
  }

  // The Set-Cookie line of the refresh token, and the "name=value" pair to
  // send it back with.
  function refreshCookieOf(response: request.Response) {
    const header = ([] as string[])
      .concat(response.headers['set-cookie'] ?? [])
      .find((cookie) => cookie.startsWith('slomp_refresh='));
    return { header, pair: header?.split(';')[0] ?? '' };
  }

  function callProtectedEndpoint(accessToken: string) {
    // No file attached: 400 means the guard let the request through.
    return request(app.getHttpServer())
      .post('/municipalities/paez/tax-roll/import')
      .set('Authorization', `Bearer ${accessToken}`);
  }

  it('opens a session: short-lived JWT in the body, refresh token only in an httpOnly cookie', async () => {
    const response = await login();

    expect(response.body.expiresIn).toBe(15 * 60);
    expect(response.body.idleTimeoutSeconds).toBe(30 * 60);
    expect(typeof response.body.sessionExpiresAt).toBe('string');
    expect(response.body.refreshToken).toBeUndefined();

    const { header } = refreshCookieOf(response);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=Strict/i);
    expect(header).toMatch(/Path=\/auth/i);
  });

  it('renews the session with the cookie and rotates the refresh token', async () => {
    const first = refreshCookieOf(await login());

    const renewed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', first.pair)
      .expect(200);

    expect(refreshCookieOf(renewed).pair).not.toBe(first.pair);
    await callProtectedEndpoint(renewed.body.accessToken).expect(400);
  });

  it('closes the whole session when a refresh token is used twice', async () => {
    const first = refreshCookieOf(await login());
    const renewed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', first.pair)
      .expect(200);

    const reused = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', first.pair)
      .expect(401);
    expect(reused.body.code).toBe('AUTH_SESSION_INVALID');

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', refreshCookieOf(renewed).pair)
      .expect(401);
    await callProtectedEndpoint(renewed.body.accessToken).expect(401);
  });

  it('rejects a refresh without the cookie', async () => {
    await request(app.getHttpServer()).post('/auth/refresh').expect(401);
  });

  it('rejects a refresh or logout sent from an origin outside CORS_ORIGIN', async () => {
    const { pair } = refreshCookieOf(await login());

    for (const path of ['/auth/refresh', '/auth/logout']) {
      await request(app.getHttpServer())
        .post(path)
        .set('Origin', 'https://evil.example')
        .set('Cookie', pair)
        .expect(403);
    }

    // Neither call touched the session.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', pair)
      .expect(200);
  });

  it('logout revokes the session: neither its JWT nor its refresh token work afterwards', async () => {
    const session = await login();
    const { pair } = refreshCookieOf(session);
    await callProtectedEndpoint(session.body.accessToken).expect(400);

    const logout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Cookie', pair)
      .expect(204);
    expect(refreshCookieOf(logout).header).toMatch(/slomp_refresh=;/);

    await callProtectedEndpoint(session.body.accessToken).expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Cookie', pair)
      .expect(401);
  });

  it('answers a logout without a session with 204', async () => {
    await request(app.getHttpServer()).post('/auth/logout').expect(204);
  });

  it('rejects a login missing email/password with 400', async () => {
    await request(app.getHttpServer()).post('/login').send({}).expect(400);
  });

  it('keeps the public root route reachable without a token', async () => {
    await request(app.getHttpServer()).get('/').expect(200);
  });

  it('blocks a panel endpoint when no token is sent', async () => {
    await request(app.getHttpServer())
      .post('/municipalities/paez/tax-roll/import')
      .expect(401);
  });

  it('blocks a panel endpoint when the token is invalid', async () => {
    await request(app.getHttpServer())
      .post('/municipalities/paez/tax-roll/import')
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(401);
  });

  it('lets a panel endpoint through once a valid token is sent', async () => {
    const login = await request(app.getHttpServer())
      .post('/login')
      .send({ email: SEEDED_ADMIN_EMAIL, password: SEEDED_ADMIN_PASSWORD });

    // No file attached: clears the guard, then fails its own validation as
    // usual (400, not 401) — proves the request reached the controller.
    await request(app.getHttpServer())
      .post('/municipalities/paez/tax-roll/import')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(400);
  });
});
