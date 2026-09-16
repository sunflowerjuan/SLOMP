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

describe('POST /tax-roll/import (e2e, real Páez tax roll file)', () => {
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

  it('processes the full real file without throwing and without dropping rows', async () => {
    const fileBuffer = readFileSync(FIXTURE_PATH);
    const totalDataRows = 11202; // rows 2..11203 of the fixture, row 1 is the header

    const response = await request(app.getHttpServer())
      .post('/tax-roll/import')
      .attach('file', fileBuffer, 'excel_example.xlsx')
      .expect(201);

    const { validRows, invalidRows, warnings } = response.body;

    expect(validRows.length + invalidRows.length).toBe(totalDataRows);
    expect(Array.isArray(warnings)).toBe(true);
    for (const row of validRows) {
      expect(row.cadastralCode).toBeTruthy();
      expect(Number.isInteger(row.period)).toBe(true);
    }
  });

  it('returns 400 (not a 500) for a blank Excel file', async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('Blank');
    const blankBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const response = await request(app.getHttpServer())
      .post('/tax-roll/import')
      .attach('file', blankBuffer, 'blank.xlsx')
      .expect(400);

    expect(response.body.message).toMatch(/empty/i);
  });

  it('returns 400 (not a 500) when no file is attached', async () => {
    await request(app.getHttpServer()).post('/tax-roll/import').expect(400);
  });
});
