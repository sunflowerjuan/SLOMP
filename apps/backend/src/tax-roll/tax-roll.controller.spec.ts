import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TaxRollController } from './tax-roll.controller.js';
import { TaxRollService } from './tax-roll.service.js';
import { MAX_TAX_ROLL_FILE_SIZE_BYTES } from './tax-roll-upload.js';

// HTTP-level checks of the upload itself (size, extension, missing file).
// The service is a stub: none of these cases may ever reach it.
const PAEZ = {
  id: 1,
  slug: 'paez',
  name: 'Páez',
  state: 'Boyacá',
  daneCode: '15514',
};
const BASE = '/municipalities/paez/tax-roll';

describe('TaxRollController upload restrictions', () => {
  let app: INestApplication;
  const taxRollService = { import: vi.fn(), listImports: vi.fn() };
  const prisma = {
    municipality: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) =>
        where.slug === PAEZ.slug ? PAEZ : null,
      ),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TaxRollController],
      providers: [
        { provide: TaxRollService, useValue: taxRollService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    // Stands in for JwtAuthGuard, which these tests do not load.
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { id: 7, email: 'admin@example.com' };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a file over the size limit with a 400 and a specific message', async () => {
    const response = await request(app.getHttpServer())
      .post(`${BASE}/import`)
      .attach(
        'file',
        Buffer.alloc(MAX_TAX_ROLL_FILE_SIZE_BYTES + 1),
        'cartera.xlsx',
      )
      .expect(400);

    expect(response.body.message).toBe(
      'The file exceeds the maximum allowed size of 10 MB.',
    );
    expect(taxRollService.import).not.toHaveBeenCalled();
  });

  it('rejects a file without the .xlsx extension', async () => {
    const response = await request(app.getHttpServer())
      .post(`${BASE}/import`)
      .attach('file', Buffer.from('a,b\n1,2'), 'cartera.csv')
      .expect(400);

    expect(response.body.message).toBe('The file must have a .xlsx extension.');
    expect(taxRollService.import).not.toHaveBeenCalled();
  });

  it('rejects a request without a file', async () => {
    const response = await request(app.getHttpServer())
      .post(`${BASE}/import`)
      .expect(400);

    expect(response.body.message).toMatch(/must attach an Excel file/);
    expect(taxRollService.import).not.toHaveBeenCalled();
  });

  it('answers 404 MUNICIPALITY_NOT_FOUND for an unknown slug, before looking at the file', async () => {
    const response = await request(app.getHttpServer())
      .post('/municipalities/nope/tax-roll/import')
      .attach('file', Buffer.from('x'), 'cartera.xlsx')
      .expect(404);

    expect(response.body.code ?? response.body.message?.code).toBe(
      ErrorCode.MUNICIPALITY_NOT_FOUND,
    );
    expect(taxRollService.import).not.toHaveBeenCalled();
  });

  it('hands the municipality of the URL to the service', async () => {
    taxRollService.import.mockResolvedValue({ importId: 1 });

    await request(app.getHttpServer())
      .post(`${BASE}/import`)
      .attach('file', Buffer.from('x'), 'cartera.xlsx')
      .expect(201);

    expect(taxRollService.import).toHaveBeenCalledWith(
      PAEZ,
      expect.any(Buffer),
      false,
      'cartera.xlsx',
      7,
      undefined,
    );
  });

  it('lists the imports of the municipality of the URL only', async () => {
    taxRollService.listImports.mockResolvedValue([]);

    await request(app.getHttpServer()).get(`${BASE}/imports`).expect(200);

    expect(taxRollService.listImports).toHaveBeenCalledWith(PAEZ.id);
  });
});
