import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { TEMPLATE_PATH } from './../src/liquidation-template/render-liquidation-docx.js';

const SEEDED_ADMIN_EMAIL =
  process.env.SEED_ADMIN_EMAIL ?? 'admin@paez-boyaca.gov.co';
const SEEDED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123';

// Seeded by packages/shared/prisma/seed.ts.
const SEEDED_CADASTRAL_CODE = '155760001000000010001';
const SEEDED_ADDRESS = 'Vereda El Chuscal, Finca La Esperanza';

function hasSoffice(): boolean {
  try {
    execFileSync('soffice', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// The real .docx is client material, not versioned in git -- see
// templates/.gitkeep. Without it there's no fallback: renderLiquidationDocx
// always reads from the real TEMPLATE_PATH in the actual generation flow
// (only unit tests substitute a fixture, by passing it a different path
// directly). Skip, don't fail, when either prerequisite is missing locally.
const canGeneratePdf = hasSoffice() && existsSync(TEMPLATE_PATH);

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

describe.skipIf(!canGeneratePdf)(
  'Liquidation PDF generation (e2e, real template + soffice)',
  () => {
    let app: INestApplication;
    let accessToken: string;

    beforeEach(async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      await app.init();

      const login = await request(app.getHttpServer())
        .post('/login')
        .send({ email: SEEDED_ADMIN_EMAIL, password: SEEDED_ADMIN_PASSWORD });
      accessToken = login.body.accessToken;
    });

    afterEach(async () => {
      await app.close();
    });

    async function findSeededSettlementId(): Promise<number> {
      const response = await request(app.getHttpServer())
        .get('/settlements/search')
        .query({ cadastralCode: SEEDED_CADASTRAL_CODE })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const [settlement] = response.body;
      if (!settlement) {
        throw new Error(
          `No seeded settlement found for ${SEEDED_CADASTRAL_CODE} -- did you run db:seed?`,
        );
      }
      return settlement.settlementId;
    }

    it('admin route: generates a real, non-empty PDF for a seeded settlement', async () => {
      const settlementId = await findSeededSettlementId();

      const response = await request(app.getHttpServer())
        .post(`/settlements/${settlementId}/liquidation-pdf`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toMatch(
        /attachment; filename="\d{4}-\d{4}\.pdf"/,
      );
      expect(isPdf(response.body as Buffer)).toBe(true);
      expect((response.body as Buffer).length).toBeGreaterThan(1000);
    }, 30_000);

    it('admin route: rejects without a JWT (panel endpoint)', async () => {
      const settlementId = await findSeededSettlementId();

      await request(app.getHttpServer())
        .post(`/settlements/${settlementId}/liquidation-pdf`)
        .expect(401);
    });

    it('public route: generates the same PDF without a JWT, given 2 of 3 matching fields', async () => {
      const settlementId = await findSeededSettlementId();

      const response = await request(app.getHttpServer())
        .post(`/consulta-publica/${settlementId}/liquidacion-pdf`)
        .send({ cadastralCode: SEEDED_CADASTRAL_CODE, address: SEEDED_ADDRESS })
        .expect(201);

      expect(isPdf(response.body as Buffer)).toBe(true);
    }, 30_000);

    it('public route: returns 404 (never a PDF) when the data does not match the settlement', async () => {
      const settlementId = await findSeededSettlementId();

      await request(app.getHttpServer())
        .post(`/consulta-publica/${settlementId}/liquidacion-pdf`)
        .send({
          cadastralCode: SEEDED_CADASTRAL_CODE,
          address: 'Not the real address',
        })
        .expect(404);
    });

    it('a property with periods in both ranges produces two liquidaciones with distinct consecutive numbers', async () => {
      // A tiny, self-contained import (not the 11k-row fixture) with one
      // property, one period on each side of the prescription-risk
      // boundary (period <= currentYear - 5).
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
      const cadastralCode = '000700070007';
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('TaxRoll');
      sheet.addRow(HEADERS);
      const oldPeriod = new Date().getFullYear() - 10; // well into prescription risk
      const recentPeriod = new Date().getFullYear() - 1; // well into normal collection
      for (const period of [oldPeriod, recentPeriod]) {
        sheet.addRow([
          cadastralCode,
          'rural',
          500000,
          '99988877',
          'Ana Torres',
          'Finca Dos Rangos',
          period,
          40000,
          0,
          1000,
          0,
          500,
          0,
          41500,
        ]);
      }

      await request(app.getHttpServer())
        .post('/tax-roll/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach(
          'file',
          Buffer.from(await workbook.xlsx.writeBuffer()),
          'two-ranges.xlsx',
        )
        .expect(201);

      const search = await request(app.getHttpServer())
        .get('/settlements/search')
        .query({ cadastralCode })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const oldSettlement = search.body.find(
        (s: { period: number }) => s.period === oldPeriod,
      );
      const recentSettlement = search.body.find(
        (s: { period: number }) => s.period === recentPeriod,
      );

      const oldPdf = await request(app.getHttpServer())
        .post(`/settlements/${oldSettlement.settlementId}/liquidation-pdf`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);
      const recentPdf = await request(app.getHttpServer())
        .post(`/settlements/${recentSettlement.settlementId}/liquidation-pdf`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(isPdf(oldPdf.body as Buffer)).toBe(true);
      expect(isPdf(recentPdf.body as Buffer)).toBe(true);
      expect(oldPdf.headers['content-disposition']).not.toBe(
        recentPdf.headers['content-disposition'],
      );
    }, 30_000);
  },
);

// Documents why the suite above might silently show 0 tests run locally.
if (!canGeneratePdf) {
  console.warn(
    `Skipping liquidation PDF e2e tests: ${hasSoffice() ? '' : 'soffice not found; '}${
      existsSync(TEMPLATE_PATH) ? '' : `template missing at ${TEMPLATE_PATH}`
    }`.trim(),
  );
}
