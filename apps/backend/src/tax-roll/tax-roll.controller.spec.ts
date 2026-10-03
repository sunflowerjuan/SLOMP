import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { TaxRollController } from './tax-roll.controller.js';
import { TaxRollService } from './tax-roll.service.js';
import { MAX_TAX_ROLL_FILE_SIZE_BYTES } from './tax-roll-upload.js';

// HTTP-level checks of the upload itself (size, extension, missing file).
// The service is a stub: none of these cases may ever reach it.
describe('TaxRollController upload restrictions', () => {
  let app: INestApplication;
  const taxRollService = { import: vi.fn(), listImports: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TaxRollController],
      providers: [{ provide: TaxRollService, useValue: taxRollService }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a file over the size limit with a 400 and a specific message', async () => {
    const response = await request(app.getHttpServer())
      .post('/tax-roll/import')
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
      .post('/tax-roll/import')
      .attach('file', Buffer.from('a,b\n1,2'), 'cartera.csv')
      .expect(400);

    expect(response.body.message).toBe('The file must have a .xlsx extension.');
    expect(taxRollService.import).not.toHaveBeenCalled();
  });

  it('rejects a request without a file', async () => {
    const response = await request(app.getHttpServer())
      .post('/tax-roll/import')
      .expect(400);

    expect(response.body.message).toMatch(/must attach an Excel file/);
    expect(taxRollService.import).not.toHaveBeenCalled();
  });
});
