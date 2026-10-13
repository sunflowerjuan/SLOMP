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
import { TemplatesController } from './templates.controller.js';
import { TemplatesService } from './templates.service.js';
import { MAX_TEMPLATE_FILE_SIZE_BYTES } from './template-upload.js';

// HTTP-level checks: the file restrictions and how the URL's municipality and
// the query reach the service. The service is a stub.
const PAEZ = {
  id: 1,
  slug: 'paez',
  name: 'Páez',
  state: 'Boyacá',
  daneCode: '15514',
};
const BASE = '/municipalities/paez/templates';

describe('TemplatesController', () => {
  let app: INestApplication;
  const templatesService = {
    upload: vi.fn(),
    list: vi.fn(),
    activate: vi.fn(),
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
      controllers: [TemplatesController],
      providers: [
        { provide: TemplatesService, useValue: templatesService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        exceptionFactory: validationExceptionFactory,
      }),
    );
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const docx = Buffer.from('PK-not-checked-here');
  const codeOf = (body: { code?: string; message?: { code?: string } }) =>
    body.code ?? body.message?.code;

  describe('POST /templates', () => {
    it('hands the municipality, type, file and user to the service', async () => {
      templatesService.upload.mockResolvedValue({ id: 1, version: 1 });

      const response = await request(app.getHttpServer())
        .post(BASE)
        .field('documentType', 'LIQUIDACION')
        .attach('file', docx, 'liquidacion.docx')
        .expect(201);

      expect(response.body).toEqual({ id: 1, version: 1 });
      expect(templatesService.upload).toHaveBeenCalledWith(
        PAEZ,
        'LIQUIDACION',
        { buffer: expect.any(Buffer), originalname: 'liquidacion.docx' },
        7,
      );
    });

    it('rejects a request without a file', async () => {
      const response = await request(app.getHttpServer())
        .post(BASE)
        .field('documentType', 'LIQUIDACION')
        .expect(400);

      expect(codeOf(response.body)).toBe(ErrorCode.TEMPLATE_FILE_MISSING);
      expect(templatesService.upload).not.toHaveBeenCalled();
    });

    it('rejects a file without the .docx extension', async () => {
      const response = await request(app.getHttpServer())
        .post(BASE)
        .field('documentType', 'LIQUIDACION')
        .attach('file', docx, 'liquidacion.doc')
        .expect(400);

      expect(codeOf(response.body)).toBe(ErrorCode.TEMPLATE_FILE_EXTENSION);
      expect(templatesService.upload).not.toHaveBeenCalled();
    });

    it('rejects a file over the size limit with its own code', async () => {
      const response = await request(app.getHttpServer())
        .post(BASE)
        .field('documentType', 'LIQUIDACION')
        .attach(
          'file',
          Buffer.alloc(MAX_TEMPLATE_FILE_SIZE_BYTES + 1),
          'liquidacion.docx',
        )
        .expect(400);

      expect(codeOf(response.body)).toBe(ErrorCode.TEMPLATE_FILE_TOO_LARGE);
      expect(templatesService.upload).not.toHaveBeenCalled();
    });

    it('rejects a missing or unknown document type', async () => {
      const missing = await request(app.getHttpServer())
        .post(BASE)
        .attach('file', docx, 'liquidacion.docx')
        .expect(400);
      const unknown = await request(app.getHttpServer())
        .post(BASE)
        .field('documentType', 'FACTURA')
        .attach('file', docx, 'liquidacion.docx')
        .expect(400);

      expect(codeOf(missing.body)).toBe(ErrorCode.REQUEST_VALIDATION_FAILED);
      expect(codeOf(unknown.body)).toBe(ErrorCode.REQUEST_VALIDATION_FAILED);
      expect(templatesService.upload).not.toHaveBeenCalled();
    });

    it('answers 404 MUNICIPALITY_NOT_FOUND for an unknown slug', async () => {
      const response = await request(app.getHttpServer())
        .post('/municipalities/nope/templates')
        .field('documentType', 'LIQUIDACION')
        .attach('file', docx, 'liquidacion.docx')
        .expect(404);

      expect(codeOf(response.body)).toBe(ErrorCode.MUNICIPALITY_NOT_FOUND);
      expect(templatesService.upload).not.toHaveBeenCalled();
    });
  });

  describe('GET /templates', () => {
    it('lists the versions of the municipality of the URL', async () => {
      templatesService.list.mockResolvedValue([]);

      await request(app.getHttpServer()).get(BASE).expect(200);

      expect(templatesService.list).toHaveBeenCalledWith(PAEZ.id, undefined);
    });

    it('filters by document type', async () => {
      templatesService.list.mockResolvedValue([]);

      await request(app.getHttpServer())
        .get(`${BASE}?documentType=LIQUIDACION`)
        .expect(200);

      expect(templatesService.list).toHaveBeenCalledWith(
        PAEZ.id,
        'LIQUIDACION',
      );
    });

    it('rejects an unknown document type', async () => {
      await request(app.getHttpServer())
        .get(`${BASE}?documentType=FACTURA`)
        .expect(400);

      expect(templatesService.list).not.toHaveBeenCalled();
    });
  });

  describe('POST /templates/:id/activate', () => {
    it('activates the version for the municipality of the URL', async () => {
      templatesService.activate.mockResolvedValue({ id: 5, isActive: true });

      await request(app.getHttpServer()).post(`${BASE}/5/activate`).expect(200);

      expect(templatesService.activate).toHaveBeenCalledWith(PAEZ.id, 5);
    });

    it('rejects an id that is not a number', async () => {
      await request(app.getHttpServer())
        .post(`${BASE}/abc/activate`)
        .expect(400);

      expect(templatesService.activate).not.toHaveBeenCalled();
    });
  });
});
