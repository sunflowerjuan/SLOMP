import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

const SEEDED_ADMIN_EMAIL =
  process.env.SEED_ADMIN_EMAIL ?? 'admin@paez-boyaca.gov.co';
const SEEDED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

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

  it('rejects a login missing email/password with 400', async () => {
    await request(app.getHttpServer()).post('/login').send({}).expect(400);
  });

  it('keeps the public root route reachable without a token', async () => {
    await request(app.getHttpServer()).get('/').expect(200);
  });

  it('blocks a panel endpoint when no token is sent', async () => {
    await request(app.getHttpServer()).post('/tax-roll/import').expect(401);
  });

  it('blocks a panel endpoint when the token is invalid', async () => {
    await request(app.getHttpServer())
      .post('/tax-roll/import')
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
      .post('/tax-roll/import')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(400);
  });
});
