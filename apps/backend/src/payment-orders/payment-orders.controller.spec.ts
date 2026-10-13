import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { validationExceptionFactory } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MAX_PAYMENT_ORDERS_PER_REQUEST } from './generate-payment-orders.dto.js';
import { PaymentOrdersController } from './payment-orders.controller.js';
import { PaymentOrdersService } from './payment-orders.service.js';

const PAEZ = {
  id: 1,
  slug: 'paez',
  name: 'Páez',
  state: 'Boyacá',
  daneCode: '15514',
};
const BASE = '/municipalities/paez/payment-orders';

describe('PaymentOrdersController', () => {
  let app: INestApplication;
  const service = {
    previewImport: vi.fn(),
    generate: vi.fn(),
    list: vi.fn(),
  };
  const prisma = {
    municipality: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) =>
        where.slug === PAEZ.slug ? PAEZ : null,
      ),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentOrdersController],
      providers: [
        { provide: PaymentOrdersService, useValue: service },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    // Stands in for JwtAuthGuard, which these tests do not load.
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { id: 7, email: 'admin@example.com' };
      next();
    });
    // Same pipe as main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    service.previewImport.mockReset();
    service.generate.mockReset();
    service.list.mockReset();
  });

  describe('municipality of the route', () => {
    it('answers 404 MUNICIPALITY_NOT_FOUND for an unknown slug, on every route', async () => {
      const server = app.getHttpServer();
      const responses = await Promise.all([
        request(server).get('/municipalities/nope/payment-orders'),
        request(server)
          .post('/municipalities/nope/payment-orders')
          .send({ settlementIds: [1] }),
        request(server)
          .post('/municipalities/nope/payment-orders/import')
          .attach('file', Buffer.from('x'), 'm.xlsx'),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(response.body.code ?? response.body.message?.code).toBe(
          ErrorCode.MUNICIPALITY_NOT_FOUND,
        );
      }
      expect(service.list).not.toHaveBeenCalled();
      expect(service.generate).not.toHaveBeenCalled();
      expect(service.previewImport).not.toHaveBeenCalled();
    });
  });

  describe('POST / (generate): body validation', () => {
    it('hands the municipality, the administrator and the ids to the service', async () => {
      service.generate.mockResolvedValue({ created: [], rejected: [] });

      await request(app.getHttpServer())
        .post(BASE)
        .send({ settlementIds: [3, 1, 2] })
        .expect(201);

      expect(service.generate).toHaveBeenCalledWith(PAEZ.id, 7, [3, 1, 2]);
    });

    it.each([
      ['no body', undefined],
      ['an empty object', {}],
      ['an empty list', { settlementIds: [] }],
      ['a string instead of a list', { settlementIds: '1,2' }],
      ['a non-integer id', { settlementIds: [1.5] }],
      ['a text id', { settlementIds: ['abc'] }],
      ['a zero id', { settlementIds: [0] }],
      ['a negative id', { settlementIds: [-4] }],
      ['repeated ids', { settlementIds: [1, 1] }],
      ['null', { settlementIds: null }],
    ])(
      'rejects %s with a 400 and does not generate anything',
      async (_name, body) => {
        const response = await request(app.getHttpServer())
          .post(BASE)
          .send(body as object)
          .expect(400);

        expect(response.body.code).toBe(ErrorCode.REQUEST_VALIDATION_FAILED);
        expect(service.generate).not.toHaveBeenCalled();
      },
    );

    it('rejects a field that is not part of the request', async () => {
      const response = await request(app.getHttpServer())
        .post(BASE)
        .send({ settlementIds: [1], municipalityId: 99 })
        .expect(400);

      expect(response.body.code).toBe(ErrorCode.REQUEST_VALIDATION_FAILED);
      expect(service.generate).not.toHaveBeenCalled();
    });

    it('rejects more ids than the limit', async () => {
      const tooMany = Array.from(
        { length: MAX_PAYMENT_ORDERS_PER_REQUEST + 1 },
        (_, i) => i + 1,
      );

      await request(app.getHttpServer())
        .post(BASE)
        .send({ settlementIds: tooMany })
        .expect(400);
      expect(service.generate).not.toHaveBeenCalled();
    });

    it('accepts exactly the limit', async () => {
      service.generate.mockResolvedValue({ created: [], rejected: [] });
      const atLimit = Array.from(
        { length: MAX_PAYMENT_ORDERS_PER_REQUEST },
        (_, i) => i + 1,
      );

      await request(app.getHttpServer())
        .post(BASE)
        .send({ settlementIds: atLimit })
        .expect(201);
    });
  });

  describe('POST /import: the Excel upload', () => {
    it('rejects a request without a file', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/import`)
        .expect(400);

      expect(response.body.message).toMatch(/must attach an Excel file/);
      expect(service.previewImport).not.toHaveBeenCalled();
    });

    it('rejects a file without the .xlsx extension', async () => {
      const response = await request(app.getHttpServer())
        .post(`${BASE}/import`)
        .attach('file', Buffer.from('a,b'), 'mandamientos.csv')
        .expect(400);

      expect(response.body.message).toBe(
        'The file must have a .xlsx extension.',
      );
      expect(service.previewImport).not.toHaveBeenCalled();
    });

    it('hands the municipality of the URL and the file to the service', async () => {
      service.previewImport.mockResolvedValue({ rows: 0 });

      await request(app.getHttpServer())
        .post(`${BASE}/import`)
        .attach('file', Buffer.from('x'), 'mandamientos.xlsx')
        .expect(201);

      expect(service.previewImport).toHaveBeenCalledWith(
        PAEZ,
        expect.any(Buffer),
        'mandamientos.xlsx',
      );
    });
  });

  it('GET / lists the payment orders of the municipality of the URL only', async () => {
    service.list.mockResolvedValue([]);

    await request(app.getHttpServer()).get(BASE).expect(200);

    expect(service.list).toHaveBeenCalledWith(PAEZ.id);
  });
});
