import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// An Administrator whose password someone else chose (admin:create,
// admin:rotate-password, seed outside a local machine) must replace it
// before using the panel (security policy, 4.3; SL-115).
const EMAIL = 'sl115-e2e-must-change@example.com';
const INITIAL_PASSWORD = 'contraseña inicial entregada';
const NEW_PASSWORD = 'una frase larga que nadie conoce';

describe('Mandatory password change (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.administrator.deleteMany({ where: { email: EMAIL } });
    await prisma.administrator.create({
      data: {
        email: EMAIL,
        passwordHash: await bcrypt.hash(INITIAL_PASSWORD, 4),
        mustChangePassword: true,
      },
    });
  });

  afterEach(async () => {
    await prisma.administrator.deleteMany({ where: { email: EMAIL } });
    await app.close();
  });

  function login(password: string) {
    return request(app.getHttpServer())
      .post('/login')
      .send({ email: EMAIL, password });
  }

  function listMunicipalities(accessToken: string) {
    return request(app.getHttpServer())
      .get('/municipalities')
      .set('Authorization', `Bearer ${accessToken}`);
  }

  function changePassword(
    accessToken: string,
    body: { currentPassword: string; newPassword: string },
  ) {
    return request(app.getHttpServer())
      .post('/auth/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);
  }

  it('flags the session and blocks the panel until the password is changed', async () => {
    const session = await login(INITIAL_PASSWORD).expect(201);
    expect(session.body.mustChangePassword).toBe(true);

    const blocked = await listMunicipalities(session.body.accessToken).expect(
      403,
    );
    expect(blocked.body.code).toBe('AUTH_PASSWORD_CHANGE_REQUIRED');

    await changePassword(session.body.accessToken, {
      currentPassword: INITIAL_PASSWORD,
      newPassword: NEW_PASSWORD,
    }).expect(204);

    // Same access token: the flag is read from the database on each request.
    await listMunicipalities(session.body.accessToken).expect(200);
    await login(INITIAL_PASSWORD).expect(401);
    const next = await login(NEW_PASSWORD).expect(201);
    expect(next.body.mustChangePassword).toBe(false);
  });

  it('rejects a wrong current password and a new password that breaks the policy', async () => {
    const { body } = await login(INITIAL_PASSWORD).expect(201);

    const wrongCurrent = await changePassword(body.accessToken, {
      currentPassword: 'not the current one',
      newPassword: NEW_PASSWORD,
    }).expect(400);
    expect(wrongCurrent.body.code).toBe('AUTH_CURRENT_PASSWORD_INVALID');

    const weak = await changePassword(body.accessToken, {
      currentPassword: INITIAL_PASSWORD,
      newPassword: 'Password2026!',
    }).expect(400);
    expect(weak.body).toMatchObject({
      code: 'AUTH_PASSWORD_POLICY_VIOLATION',
      details: { violations: ['COMMON'] },
    });

    await listMunicipalities(body.accessToken).expect(403);
  });

  it('closes the other sessions of the account and keeps the current one', async () => {
    const other = await login(INITIAL_PASSWORD).expect(201);
    const current = await login(INITIAL_PASSWORD).expect(201);

    await changePassword(current.body.accessToken, {
      currentPassword: INITIAL_PASSWORD,
      newPassword: NEW_PASSWORD,
    }).expect(204);

    await listMunicipalities(current.body.accessToken).expect(200);
    await listMunicipalities(other.body.accessToken).expect(401);
  });

  it('requires a session', async () => {
    await request(app.getHttpServer())
      .post('/auth/password')
      .send({ currentPassword: INITIAL_PASSWORD, newPassword: NEW_PASSWORD })
      .expect(401);
  });
});
