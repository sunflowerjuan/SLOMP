import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

// Two municipalities with the SAME citizen (same owner document, name and
// address) -- the only way "the same data" can exist in two municipalities,
// since a cadastral code is unique across all of them. Each municipality's
// iframe must show only its own settlements.
const OWNER = { name: 'Ciudadana Consulta E2E', documentId: '1010101010' };
const ADDRESS = 'Calle 1 # 2-3 E2E';
const SLUG_A = 'e2e-consulta-a';
const SLUG_B = 'e2e-consulta-b';
const CRITERIA = { ownerName: OWNER.name, address: ADDRESS };

describe('Public consultation by municipality (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const municipalityIds: number[] = [];

  async function seedMunicipality(
    slug: string,
    name: string,
    daneCode: string,
    totals: number[],
  ) {
    const municipality = await prisma.municipality.create({
      data: { slug, name, state: 'E2E', daneCode },
    });
    municipalityIds.push(municipality.id);
    const owner = await prisma.owner.create({
      data: { ...OWNER, municipalityId: municipality.id },
    });
    const property = await prisma.property.create({
      data: {
        cadastralCode: `${daneCode}0001000000010001`,
        address: ADDRESS,
        municipalityId: municipality.id,
        owners: { create: { ownerId: owner.id, percentage: 100 } },
      },
    });
    const settlements = await Promise.all(
      totals.map((totalAmount, index) =>
        prisma.settlement.create({
          data: {
            propertyId: property.id,
            period: 2020 + index,
            totalAmount,
          },
        }),
      ),
    );
    return { municipality, settlements };
  }

  async function cleanup() {
    const where = { municipalityId: { in: municipalityIds } };
    await prisma.settlement.deleteMany({ where: { property: where } });
    await prisma.property.deleteMany({ where });
    await prisma.owner.deleteMany({ where });
    await prisma.municipality.deleteMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
    });
  }

  let settlementsA: { id: number }[];
  let settlementsB: { id: number }[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // A previous aborted run may have left rows behind.
    const stale = await prisma.municipality.findMany({
      where: { slug: { in: [SLUG_A, SLUG_B] } },
      select: { id: true },
    });
    municipalityIds.push(...stale.map(({ id }) => id));
    await cleanup();
    municipalityIds.length = 0;

    settlementsA = (
      await seedMunicipality(
        SLUG_A,
        'Municipio A E2E',
        '99001',
        [111_000, 222_000],
      )
    ).settlements;
    settlementsB = (
      await seedMunicipality(SLUG_B, 'Municipio B E2E', '99002', [444_000])
    ).settlements;
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  it('answers each municipality with only its own settlements, for the same citizen data', async () => {
    const a = await request(app.getHttpServer())
      .post(`/consulta-publica/${SLUG_A}`)
      .send(CRITERIA)
      .expect(201);
    const b = await request(app.getHttpServer())
      .post(`/consulta-publica/${SLUG_B}`)
      .send(CRITERIA)
      .expect(201);

    expect(a.body).toHaveLength(1);
    expect(a.body[0].cadastralCode).toMatch(/^99001/);
    expect(a.body[0].periods).toEqual([2020, 2021]);
    expect(a.body[0].totalAmount).toBe(333_000);
    expect(b.body).toHaveLength(1);
    expect(b.body[0].cadastralCode).toMatch(/^99002/);
    expect(b.body[0].periods).toEqual([2020]);
    expect(b.body[0].totalAmount).toBe(444_000);
  });

  it("does not find a municipality's predio through another municipality's slug", async () => {
    const response = await request(app.getHttpServer())
      .post(`/consulta-publica/${SLUG_B}`)
      .send({ cadastralCode: `990010001000000010001`, address: ADDRESS })
      .expect(201);

    expect(response.body).toEqual([]);
  });

  it('answers an unknown slug exactly like a known one with no match', async () => {
    const unknown = await request(app.getHttpServer())
      .post('/consulta-publica/e2e-no-existe')
      .send(CRITERIA);
    const noMatch = await request(app.getHttpServer())
      .post(`/consulta-publica/${SLUG_A}`)
      .send({ ownerName: 'Nadie', address: 'Ninguna' });

    expect(unknown.status).toBe(noMatch.status);
    expect(unknown.body).toEqual(noMatch.body);
    expect(unknown.body).toEqual([]);
  });

  it('has no unscoped lookup', async () => {
    await request(app.getHttpServer())
      .post('/consulta-publica')
      .send(CRITERIA)
      .expect(404);
  });

  it('treats a settlement of another municipality, and an unknown slug, like a missing settlement on the PDF route', async () => {
    const foreign = await request(app.getHttpServer())
      .post(`/consulta-publica/${SLUG_B}/${settlementsA[0].id}/liquidacion-pdf`)
      .send(CRITERIA)
      .expect(404);
    const unknownSlug = await request(app.getHttpServer())
      .post(
        `/consulta-publica/e2e-no-existe/${settlementsB[0].id}/liquidacion-pdf`,
      )
      .send(CRITERIA)
      .expect(404);
    const missing = await request(app.getHttpServer())
      .post(`/consulta-publica/${SLUG_B}/999999999/liquidacion-pdf`)
      .send(CRITERIA)
      .expect(404);

    expect(foreign.body.code).toBe('SETTLEMENT_NOT_FOUND');
    expect(unknownSlug.body).toEqual(
      expect.objectContaining({ code: foreign.body.code }),
    );
    expect(missing.body.code).toBe(foreign.body.code);
  });

  it('GET /consulta-publica/:slug gives the municipality name only, and 404 for an unknown slug', async () => {
    const known = await request(app.getHttpServer())
      .get(`/consulta-publica/${SLUG_A}`)
      .expect(200);
    expect(known.body).toEqual({ slug: SLUG_A, name: 'Municipio A E2E' });

    await request(app.getHttpServer())
      .get('/consulta-publica/e2e-no-existe')
      .expect(404);
  });
});
