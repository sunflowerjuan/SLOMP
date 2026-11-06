import { readFileSync } from 'node:fs';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

const SEEDED_ADMIN_EMAIL =
  process.env.SEED_ADMIN_EMAIL ?? 'admin@paez-boyaca.gov.co';
const SEEDED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123';

// Seeded by packages/shared/prisma/seed.ts: Páez, Boyacá (DANE 15514).
const SEEDED_CADASTRAL_CODE = '155140001000000010001';

// A second municipality created by these tests (Páez, Cauca shares the name).
const OTHER = {
  name: 'Páez',
  state: 'Cauca',
  daneCode: '19517',
  slug: 'paez-cauca',
};

const FIXTURE_PATH = new URL('./fixtures/excel_example.xlsx', import.meta.url);

describe('Municipality isolation (e2e)', () => {
  let app: INestApplication;
  let auth: { Authorization: string };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/login')
      .send({ email: SEEDED_ADMIN_EMAIL, password: SEEDED_ADMIN_PASSWORD });
    auth = { Authorization: `Bearer ${login.body.accessToken}` };

    // Re-runs find it already there (409), which is fine.
    const created = await request(app.getHttpServer())
      .post('/municipalities')
      .set(auth)
      .send(OTHER);
    expect([201, 409]).toContain(created.status);
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires a token for every municipality route', async () => {
    await request(app.getHttpServer()).get('/municipalities').expect(401);
    await request(app.getHttpServer())
      .get('/municipalities/paez/settlements/search')
      .expect(401);
  });

  it('lists the municipalities for the selector, with their slug and DANE code', async () => {
    const response = await request(app.getHttpServer())
      .get('/municipalities')
      .set(auth)
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'paez', daneCode: '15514' }),
        expect.objectContaining({ slug: OTHER.slug, daneCode: OTHER.daneCode }),
      ]),
    );
  });

  it('answers 404 MUNICIPALITY_NOT_FOUND for an unknown slug', async () => {
    const response = await request(app.getHttpServer())
      .get('/municipalities/no-existe/settlements/search')
      .query({ cadastralCode: SEEDED_CADASTRAL_CODE })
      .set(auth)
      .expect(404);

    expect(response.body.code).toBe('MUNICIPALITY_NOT_FOUND');
  });

  it('shows the data of a municipality only under its own slug', async () => {
    const own = await request(app.getHttpServer())
      .get('/municipalities/paez/settlements/search')
      .query({ cadastralCode: SEEDED_CADASTRAL_CODE })
      .set(auth)
      .expect(200);
    const other = await request(app.getHttpServer())
      .get(`/municipalities/${OTHER.slug}/settlements/search`)
      .query({ cadastralCode: SEEDED_CADASTRAL_CODE })
      .set(auth)
      .expect(200);

    expect(own.body.length).toBeGreaterThan(0);
    expect(other.body).toEqual([]);
  });

  it('treats a settlement id of another municipality exactly like one that does not exist', async () => {
    const search = await request(app.getHttpServer())
      .get('/municipalities/paez/settlements/search')
      .query({ cadastralCode: SEEDED_CADASTRAL_CODE })
      .set(auth);
    const settlementId = search.body[0].settlementId;

    const foreign = await request(app.getHttpServer())
      .patch(`/municipalities/${OTHER.slug}/settlements/${settlementId}/status`)
      .set(auth)
      .send({ status: 'PAGADA' })
      .expect(404);
    const missing = await request(app.getHttpServer())
      .patch(`/municipalities/${OTHER.slug}/settlements/999999999/status`)
      .set(auth)
      .send({ status: 'PAGADA' })
      .expect(404);

    expect(foreign.body.code).toBe('SETTLEMENT_NOT_FOUND');
    expect(foreign.body.code).toBe(missing.body.code);
    // The PDF route checks the municipality's template before it looks the
    // settlement up, and the other municipality has none: either way nothing
    // is generated for a settlement that is not its own.
    const pdf = await request(app.getHttpServer())
      .post(
        `/municipalities/${OTHER.slug}/settlements/${settlementId}/liquidation-pdf`,
      )
      .set(auth);
    expect([404, 503]).toContain(pdf.status);
  });

  it('rejects the whole Páez tax roll when it is uploaded to another municipality, and saves nothing', async () => {
    const before = await request(app.getHttpServer())
      .get(`/municipalities/${OTHER.slug}/tax-roll/imports`)
      .set(auth)
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/municipalities/${OTHER.slug}/tax-roll/import`)
      .set(auth)
      .attach('file', readFileSync(FIXTURE_PATH), 'excel_example.xlsx')
      .expect(400);

    expect(response.body.code).toBe('TAX_ROLL_WRONG_MUNICIPALITY');
    expect(response.body.details).toMatchObject({
      expectedPrefix: OTHER.daneCode,
      foundPrefixes: [
        expect.objectContaining({
          prefix: '15514',
          municipality: 'Páez, Boyacá',
        }),
      ],
    });
    expect(response.body.message).toContain('Páez, Boyacá');

    const after = await request(app.getHttpServer())
      .get(`/municipalities/${OTHER.slug}/tax-roll/imports`)
      .set(auth)
      .expect(200);
    expect(after.body).toHaveLength(before.body.length);
  }, 60_000);

  it('does not show the import history of one municipality in another', async () => {
    const paez = await request(app.getHttpServer())
      .get('/municipalities/paez/tax-roll/imports')
      .set(auth)
      .expect(200);
    const other = await request(app.getHttpServer())
      .get(`/municipalities/${OTHER.slug}/tax-roll/imports`)
      .set(auth)
      .expect(200);

    const otherIds = new Set(
      other.body.map((entry: { id: number }) => entry.id),
    );
    expect(
      paez.body.some((entry: { id: number }) => otherIds.has(entry.id)),
    ).toBe(false);
  });

  it('keeps the slug and DANE code of a municipality with data fixed', async () => {
    const response = await request(app.getHttpServer())
      .patch('/municipalities/paez')
      .set(auth)
      .send({ slug: 'paez-boyaca' })
      .expect(409);

    expect(response.body.code).toBe('MUNICIPALITY_IMMUTABLE_FIELD');
  });

  it('rejects an invalid DANE code and a repeated one', async () => {
    const invalid = await request(app.getHttpServer())
      .post('/municipalities')
      .set(auth)
      .send({ name: 'X', state: 'Y', daneCode: '123' })
      .expect(400);
    expect(invalid.body.code).toBe('MUNICIPALITY_INVALID_DANE');

    const taken = await request(app.getHttpServer())
      .post('/municipalities')
      .set(auth)
      .send({ name: 'Otro', state: 'Y', daneCode: '15514', slug: 'otro-15514' })
      .expect(409);
    expect(taken.body.code).toBe('MUNICIPALITY_DANE_TAKEN');
  });
});
