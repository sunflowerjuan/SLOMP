import { Readable } from 'node:stream';
import {
  NotFoundException,
  ValidationPipe,
  type INestApplication,
} from '@nestjs/common';
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
import {
  errorBody,
  validationExceptionFactory,
} from '../common/errors/error-body.js';
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
    createDraft: vi.fn(),
    draftContent: vi.fn(),
    previewDraft: vi.fn(),
    saveDraft: vi.fn(),
    cancelDraft: vi.fn(),
    templateContent: vi.fn(),
    templatePreview: vi.fn(),
    templateFile: vi.fn(),
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

    it('keeps an accented file name as the browser sent it, in UTF-8', async () => {
      templatesService.upload.mockResolvedValue({ id: 1 });
      templatesService.createDraft.mockResolvedValue({ draftId: 'd1' });

      await request(app.getHttpServer())
        .post(BASE)
        .field('documentType', 'LIQUIDACION')
        .attach('file', docx, 'liquidación – páez.docx')
        .expect(201);
      await request(app.getHttpServer())
        .post(`${BASE}/drafts`)
        .field('documentType', 'LIQUIDACION')
        .attach('file', docx, 'liquidación – páez.docx')
        .expect(201);

      expect(templatesService.upload.mock.calls[0]![2].originalname).toBe(
        'liquidación – páez.docx',
      );
      expect(templatesService.createDraft.mock.calls[0]![2].originalname).toBe(
        'liquidación – páez.docx',
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

  describe('GET /templates/catalog', () => {
    it('returns the 14 liquidation fields', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/catalog?documentType=LIQUIDACION`)
        .expect(200);

      expect(response.body).toHaveLength(14);
      expect(response.body[0]).toEqual({
        key: 'resolutionNumber',
        label: 'Número de resolución',
        description: expect.any(String),
        required: true,
        kind: 'SCALAR',
      });
    });

    it('returns the 9 payment order fields', async () => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/catalog?documentType=MANDAMIENTO`)
        .expect(200);

      expect(response.body).toHaveLength(9);
    });

    it.each([
      '',
      '?documentType=FACTURA',
      '?documentType=LIQUIDACION&documentType=MANDAMIENTO',
    ])('answers 400 for the query "%s"', async (query) => {
      const response = await request(app.getHttpServer())
        .get(`${BASE}/catalog${query}`)
        .expect(400);

      expect(codeOf(response.body)).toBe(ErrorCode.REQUEST_VALIDATION_FAILED);
    });

    it('answers 404 MUNICIPALITY_NOT_FOUND for an unknown slug', async () => {
      const response = await request(app.getHttpServer())
        .get('/municipalities/nope/templates/catalog?documentType=LIQUIDACION')
        .expect(404);

      expect(codeOf(response.body)).toBe(ErrorCode.MUNICIPALITY_NOT_FOUND);
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

  describe('guided marking drafts', () => {
    const DRAFTS = `${BASE}/drafts`;
    const selection = {
      blockId: 'body:p0',
      start: 11,
      end: 14,
      field: 'resolutionNumber',
    };

    it('creates a draft with the same file checks as the upload', async () => {
      templatesService.createDraft.mockResolvedValue({ draftId: 'd1' });

      await request(app.getHttpServer())
        .post(DRAFTS)
        .field('documentType', 'LIQUIDACION')
        .attach('file', docx, 'sin-marcar.docx')
        .expect(201);
      const noFile = await request(app.getHttpServer())
        .post(DRAFTS)
        .field('documentType', 'LIQUIDACION')
        .expect(400);
      const tooLarge = await request(app.getHttpServer())
        .post(DRAFTS)
        .field('documentType', 'LIQUIDACION')
        .attach(
          'file',
          Buffer.alloc(MAX_TEMPLATE_FILE_SIZE_BYTES + 1),
          'sin-marcar.docx',
        )
        .expect(400);

      expect(templatesService.createDraft).toHaveBeenCalledTimes(1);
      expect(templatesService.createDraft).toHaveBeenCalledWith(
        PAEZ,
        'LIQUIDACION',
        { buffer: expect.any(Buffer), originalname: 'sin-marcar.docx' },
        7,
      );
      expect(codeOf(noFile.body)).toBe(ErrorCode.TEMPLATE_FILE_MISSING);
      expect(codeOf(tooLarge.body)).toBe(ErrorCode.TEMPLATE_FILE_TOO_LARGE);
    });

    it('hands the municipality, user and draft to the content', async () => {
      templatesService.draftContent.mockResolvedValue({ blocks: [] });

      await request(app.getHttpServer())
        .get(`${DRAFTS}/d1/content`)
        .expect(200);

      expect(templatesService.draftContent).toHaveBeenCalledWith(
        PAEZ.id,
        7,
        'd1',
      );
    });

    it('answers the preview as a PDF', async () => {
      templatesService.previewDraft.mockResolvedValue(Buffer.from('%PDF-1.7'));

      const response = await request(app.getHttpServer())
        .post(`${DRAFTS}/d1/preview`)
        .send({ selections: [selection], removedRows: ['body:p24'] })
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(templatesService.previewDraft).toHaveBeenCalledWith(
        PAEZ.id,
        7,
        'd1',
        [selection],
        ['body:p24'],
      );
    });

    it.each([
      {},
      { selections: 'x' },
      { selections: [{ ...selection, start: -1 }] },
      { selections: [{ ...selection, end: 1.5 }] },
      { selections: [{ ...selection, field: '' }] },
      { selections: [{ ...selection, extra: true }] },
      { selections: [], replaceConfirmed: 'yes' },
      { selections: [], removedRows: 'body:p24' },
      { selections: [], removedRows: [24] },
      { selections: [], fileName: 7 },
    ])('validates the selections of the body %j', async (body) => {
      const preview = await request(app.getHttpServer())
        .post(`${DRAFTS}/d1/save`)
        .send(body)
        .expect(400);

      expect(codeOf(preview.body)).toBe(ErrorCode.REQUEST_VALIDATION_FAILED);
      expect(templatesService.saveDraft).not.toHaveBeenCalled();
    });

    it('saves without replacing unless replaceConfirmed is true', async () => {
      templatesService.saveDraft.mockResolvedValue({ id: 3, isActive: true });

      await request(app.getHttpServer())
        .post(`${DRAFTS}/d1/save`)
        .send({ selections: [selection] })
        .expect(201);
      await request(app.getHttpServer())
        .post(`${DRAFTS}/d1/save`)
        .send({ selections: [selection], replaceConfirmed: true })
        .expect(201);

      await request(app.getHttpServer())
        .post(`${DRAFTS}/d1/save`)
        .send({ selections: [selection], fileName: 'Liquidación 2026' })
        .expect(201);

      expect(templatesService.saveDraft.mock.calls).toEqual([
        [PAEZ, 7, 'd1', [selection], false, undefined, undefined],
        [PAEZ, 7, 'd1', [selection], true, undefined, undefined],
        [PAEZ, 7, 'd1', [selection], false, undefined, 'Liquidación 2026'],
      ]);
    });

    it('cancels a draft with 204', async () => {
      await request(app.getHttpServer()).delete(`${DRAFTS}/d1`).expect(204);

      expect(templatesService.cancelDraft).toHaveBeenCalledWith(
        PAEZ.id,
        7,
        'd1',
      );
    });
  });

  describe('saved versions', () => {
    const notFound = () =>
      new NotFoundException(
        errorBody(ErrorCode.TEMPLATE_NOT_FOUND, 'Template 9 not found.'),
      );

    it('returns the content of the version of the URL', async () => {
      templatesService.templateContent.mockResolvedValue({ id: 4 });

      const response = await request(app.getHttpServer())
        .get(`${BASE}/4/content`)
        .expect(200);

      expect(response.body).toEqual({ id: 4 });
      expect(templatesService.templateContent).toHaveBeenCalledWith(PAEZ.id, 4);
    });

    it('answers the preview as a PDF', async () => {
      templatesService.templatePreview.mockResolvedValue(
        Buffer.from('%PDF-1.7'),
      );

      const response = await request(app.getHttpServer())
        .get(`${BASE}/4/preview`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.body.toString()).toBe('%PDF-1.7');
      expect(templatesService.templatePreview).toHaveBeenCalledWith(PAEZ.id, 4);
    });

    it('downloads the bytes as a .docx attachment, keeping a name outside Latin-1', async () => {
      const bytes = Buffer.from('PK-stored-template');
      templatesService.templateFile.mockResolvedValue({
        fileName: 'liquidación – páez.docx',
        stream: Readable.from([bytes]),
      });

      const response = await request(app.getHttpServer())
        .get(`${BASE}/4/download`)
        .buffer(true)
        .parse((res, done) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => done(null, Buffer.concat(chunks)));
        })
        .expect(200);

      expect(response.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain(
        "filename*=UTF-8''liquidaci%C3%B3n%20%E2%80%93%20p%C3%A1ez.docx",
      );
      expect(response.body).toEqual(bytes);
    });

    it('answers 404 TEMPLATE_NOT_FOUND on the three routes', async () => {
      templatesService.templateContent.mockRejectedValue(notFound());
      templatesService.templatePreview.mockRejectedValue(notFound());
      templatesService.templateFile.mockRejectedValue(notFound());

      for (const route of ['content', 'preview', 'download']) {
        const response = await request(app.getHttpServer())
          .get(`${BASE}/9/${route}`)
          .expect(404);
        expect(codeOf(response.body)).toBe(ErrorCode.TEMPLATE_NOT_FOUND);
      }
    });

    it('rejects an id that is not a number', async () => {
      await request(app.getHttpServer()).get(`${BASE}/abc/content`).expect(400);

      expect(templatesService.templateContent).not.toHaveBeenCalled();
    });
  });
});
