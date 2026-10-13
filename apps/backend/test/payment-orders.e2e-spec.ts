import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { validationExceptionFactory } from './../src/common/errors/error-body.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

const SEEDED_ADMIN_EMAIL =
  process.env.SEED_ADMIN_EMAIL ?? 'admin@paez-boyaca.gov.co';
const SEEDED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123';

const OTHER = {
  name: 'Páez',
  state: 'Cauca',
  daneCode: '19517',
  slug: 'paez-cauca',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HEADERS = [
  'Cédula Catastral',
  'Destino',
  'Avaluo',
  'CCNIT',
  'Propietario',
  'Nombre Predio',
  'periodo',
  'Impuesto Predial',
  'Interes Impuesto Predial',
  'C.A.R.',
  'Interes C.A.R.',
  'Sobretasa Bomberil',
  'Interes Sobretasa Bomberil',
  'Total',
];

async function excelWith(rows: { cadastralCode: string; period: number }[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Mandamientos');
  sheet.addRow(HEADERS);
  for (const row of rows) {
    sheet.addRow([
      row.cadastralCode,
      'rural',
      500000,
      '99988877',
      'Ana Torres',
      'Finca Mandamiento',
      row.period,
      40000,
      0,
      1000,
      0,
      500,
      0,
      41500,
    ]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('Payment orders (e2e)', () => {
  let app: INestApplication;
  let auth: { Authorization: string };
  let cadastralCode: string;
  let firmSettlementId: number;
  let recentSettlementId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    // The same pipe main.ts installs; the testing module does not run main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/login')
      .send({ email: SEEDED_ADMIN_EMAIL, password: SEEDED_ADMIN_PASSWORD });
    auth = { Authorization: `Bearer ${login.body.accessToken}` };

    const created = await request(app.getHttpServer())
      .post('/municipalities')
      .set(auth)
      .send(OTHER);
    expect([201, 409]).toContain(created.status);

    // A property with two settlements, each in a resolution of its own: one
    // generated 90 days ago (already firm) and one generated 10 days ago.
    // Built directly in the database so the test does not depend on LibreOffice
    // or on the official template.
    const prisma = app.get(PrismaService);
    const paez = await prisma.municipality.findUniqueOrThrow({
      where: { slug: 'paez' },
    });
    const unique = String(Date.now()).padStart(12, '0');
    cadastralCode = `15514${unique}`.padEnd(30, '7');
    const property = await prisma.property.create({
      data: {
        cadastralCode,
        address: `Finca Mandamiento ${unique}`,
        municipalityId: paez.id,
      },
    });
    const resolutionFor = (daysAgo: number, label: string) =>
      prisma.resolution.create({
        data: {
          municipalityId: paez.id,
          propertyId: property.id,
          number: `E2E-${unique}-${label}`,
          year: 2026,
          sequence: (Date.now() % 1_000_000_000) + (label === 'A' ? 0 : 1),
          kind: 'NORMAL',
          issuedAt: new Date(Date.now() - daysAgo * DAY_MS),
        },
      });
    const [firmResolution, recentResolution] = await Promise.all([
      resolutionFor(90, 'A'),
      resolutionFor(10, 'B'),
    ]);
    const settlementIn = (period: number, resolutionId: number) =>
      prisma.settlement.create({
        data: {
          propertyId: property.id,
          period,
          totalAmount: 41500,
          resolutionId,
        },
      });
    firmSettlementId = (await settlementIn(2019, firmResolution.id)).id;
    recentSettlementId = (await settlementIn(2020, recentResolution.id)).id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires a token', async () => {
    await request(app.getHttpServer())
      .get('/municipalities/paez/payment-orders')
      .expect(401);
    await request(app.getHttpServer())
      .post('/municipalities/paez/payment-orders')
      .send({ settlementIds: [1] })
      .expect(401);
  });

  it('reads the Excel and splits the periods that are firm from the ones that are not', async () => {
    const response = await request(app.getHttpServer())
      .post('/municipalities/paez/payment-orders/import')
      .set(auth)
      .attach(
        'file',
        await excelWith([
          { cadastralCode, period: 2019 },
          { cadastralCode, period: 2020 },
          { cadastralCode, period: 2021 },
        ]),
        'mandamientos.xlsx',
      )
      .expect(201);

    expect(response.body.rows).toBe(3);
    expect(response.body.eligible).toEqual([
      expect.objectContaining({ settlementId: firmSettlementId, period: 2019 }),
    ]);
    const byReason = Object.fromEntries(
      response.body.ineligible.map(
        (row: { period: number; reason: string }) => [row.period, row.reason],
      ),
    );
    expect(byReason).toEqual({
      2020: 'NOT_YET_FIRM',
      2021: 'SETTLEMENT_NOT_FOUND',
    });
    const recent = response.body.ineligible.find(
      (row: { period: number }) => row.period === 2020,
    );
    expect(new Date(recent.firmOn).getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects the Excel with the same validations as the tax roll', async () => {
    const wrongMunicipality = await request(app.getHttpServer())
      .post(`/municipalities/${OTHER.slug}/payment-orders/import`)
      .set(auth)
      .attach(
        'file',
        await excelWith([{ cadastralCode, period: 2019 }]),
        'm.xlsx',
      )
      .expect(400);
    expect(wrongMunicipality.body.code).toBe('TAX_ROLL_WRONG_MUNICIPALITY');
    expect(wrongMunicipality.body.message).toContain('Páez, Boyacá');

    const notAnExcel = await request(app.getHttpServer())
      .post('/municipalities/paez/payment-orders/import')
      .set(auth)
      .attach('file', Buffer.from('not an xlsx'), 'm.xlsx')
      .expect(400);
    expect(notAnExcel.body.code).toBe('TAX_ROLL_NOT_XLSX');

    await request(app.getHttpServer())
      .post('/municipalities/paez/payment-orders/import')
      .set(auth)
      .expect(400);
  });

  it('validates the body of the generation request', async () => {
    const response = await request(app.getHttpServer())
      .post('/municipalities/paez/payment-orders')
      .set(auth)
      .send({ settlementIds: ['x'] })
      .expect(400);

    expect(response.body.code).toBe('REQUEST_VALIDATION_FAILED');
  });

  it('does not generate a payment order for a settlement of another municipality', async () => {
    const response = await request(app.getHttpServer())
      .post(`/municipalities/${OTHER.slug}/payment-orders`)
      .set(auth)
      .send({ settlementIds: [firmSettlementId] })
      .expect(201);

    expect(response.body.created).toEqual([]);
    expect(response.body.rejected).toEqual([
      { settlementId: firmSettlementId, reason: 'SETTLEMENT_NOT_FOUND' },
    ]);
  });

  it('generates the payment order only for the settlement that is already firm', async () => {
    const response = await request(app.getHttpServer())
      .post('/municipalities/paez/payment-orders')
      .set(auth)
      .send({ settlementIds: [firmSettlementId, recentSettlementId] })
      .expect(201);

    expect(response.body.created).toHaveLength(1);
    expect(response.body.created[0]).toMatchObject({
      settlementId: firmSettlementId,
      number: expect.stringMatching(/^\d{4}-\d{4,}$/),
    });
    expect(response.body.rejected).toEqual([
      expect.objectContaining({
        settlementId: recentSettlementId,
        reason: 'NOT_YET_FIRM',
      }),
    ]);
  });

  it('does not generate a second payment order for the same settlement', async () => {
    const response = await request(app.getHttpServer())
      .post('/municipalities/paez/payment-orders')
      .set(auth)
      .send({ settlementIds: [firmSettlementId] })
      .expect(201);

    expect(response.body.created).toEqual([]);
    expect(response.body.rejected).toEqual([
      { settlementId: firmSettlementId, reason: 'ALREADY_HAS_PAYMENT_ORDER' },
    ]);
  });

  it('lists the payment orders of a municipality and none of another', async () => {
    const own = await request(app.getHttpServer())
      .get('/municipalities/paez/payment-orders')
      .set(auth)
      .expect(200);
    const other = await request(app.getHttpServer())
      .get(`/municipalities/${OTHER.slug}/payment-orders`)
      .set(auth)
      .expect(200);

    expect(own.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          settlementId: firmSettlementId,
          cadastralCode,
          period: 2019,
        }),
      ]),
    );
    expect(
      other.body.some(
        (order: { settlementId: number }) =>
          order.settlementId === firmSettlementId,
      ),
    ).toBe(false);
  });

  it('answers 404 MUNICIPALITY_NOT_FOUND for an unknown slug', async () => {
    const response = await request(app.getHttpServer())
      .get('/municipalities/no-existe/payment-orders')
      .set(auth)
      .expect(404);

    expect(response.body.code).toBe('MUNICIPALITY_NOT_FOUND');
  });
});
