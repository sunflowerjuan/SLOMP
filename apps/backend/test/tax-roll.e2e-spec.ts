import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AppModule } from './../src/app.module.js';

const FIXTURE_PATH = fileURLToPath(
  new URL('./fixtures/excel_example.xlsx', import.meta.url),
);

const SEEDED_ADMIN_EMAIL =
  process.env.SEED_ADMIN_EMAIL ?? 'admin@paez-boyaca.gov.co';
const SEEDED_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123';

describe('POST /tax-roll/import (e2e, real Páez tax roll file)', () => {
  let app: INestApplication<App>;
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

  it('rejects the request when no token is sent (this is a panel endpoint)', async () => {
    await request(app.getHttpServer()).post('/tax-roll/import').expect(401);
  });

  it('processes the full real file without throwing and without dropping rows', async () => {
    const fileBuffer = readFileSync(FIXTURE_PATH);
    const totalDataRows = 11202; // rows 2..11203 of the fixture, row 1 is the header

    const response = await request(app.getHttpServer())
      .post('/tax-roll/import')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', fileBuffer, 'excel_example.xlsx')
      .expect(201);

    const { validRows, invalidRows, warnings, persisted } = response.body;

    expect(validRows.length + invalidRows.length).toBe(totalDataRows);
    expect(Array.isArray(warnings)).toBe(true);
    for (const row of validRows) {
      expect(row.cadastralCode).toBeTruthy();
      expect(Number.isInteger(row.period)).toBe(true);
    }
    expect(persisted).toEqual({
      properties: 1004,
      owners: 809,
      settlements: validRows.length,
      conflicts: [],
    });
  });

  it('returns 400 (not a 500) for a blank Excel file', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Blank');
    const blankBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const response = await request(app.getHttpServer())
      .post('/tax-roll/import')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', blankBuffer, 'blank.xlsx')
      .expect(400);

    expect(response.body.message).toMatch(/empty/i);
  });

  it('returns 400 (not a 500) when no file is attached', async () => {
    await request(app.getHttpServer())
      .post('/tax-roll/import')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(400);
  });

  describe('alert and replace (HU18)', () => {
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

    async function buildOneRowWorkbook(total: number): Promise<Buffer> {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('TaxRoll');
      sheet.addRow(HEADERS);
      sheet.addRow([
        '000900010001',
        'urbano',
        500000,
        '99988877',
        'Ana Torres',
        'Casa Centro',
        2024,
        40000,
        0,
        1000,
        0,
        500,
        0,
        total,
      ]);
      return Buffer.from(await workbook.xlsx.writeBuffer());
    }

    it('alerts instead of replacing when a settlement is already active for that property+period', async () => {
      await request(app.getHttpServer())
        .post('/tax-roll/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', await buildOneRowWorkbook(41500), 'first.xlsx')
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/tax-roll/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', await buildOneRowWorkbook(99999), 'second.xlsx')
        .expect(201);

      expect(response.body.persisted).toEqual({
        properties: 1,
        owners: 1,
        settlements: 0,
        conflicts: [{ cadastralCode: '000900010001', period: 2024 }],
      });
    });

    it('inactivates the old settlement and creates a new active one once confirmed — never deletes it', async () => {
      await request(app.getHttpServer())
        .post('/tax-roll/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', await buildOneRowWorkbook(41500), 'first.xlsx')
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/tax-roll/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('confirmReplace', 'true')
        .attach('file', await buildOneRowWorkbook(99999), 'second.xlsx')
        .expect(201);

      expect(response.body.persisted).toEqual({
        properties: 1,
        owners: 1,
        settlements: 1,
        conflicts: [],
      });
    });
  });
});
