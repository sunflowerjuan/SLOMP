import {
  ConflictException,
  ServiceUnavailableException,
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
import { IS_PUBLIC_KEY } from '../auth/public.decorator.js';
import {
  errorBody,
  validationExceptionFactory,
} from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { setupAssistantBodyLimit } from './assistant-body-limit.js';
import { AssistantChangesService } from './assistant-changes.service.js';
import { AssistantConversationService } from './assistant-conversation.service.js';
import { AssistantRateLimiter } from './assistant-rate-limiter.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantToolsService } from './assistant-tools.service.js';

const PAEZ = {
  id: 1,
  slug: 'paez',
  name: 'Páez',
  state: 'Boyacá',
  daneCode: '15514',
};
const BASE = '/municipalities/paez/assistant/changes';
const ADMIN_ID = 7;

describe('AssistantController', () => {
  let app: INestApplication;
  const tools = { proposeStatusChange: vi.fn() };
  const changes = { confirm: vi.fn() };
  const conversation = { reply: vi.fn() };
  const rateLimiter = new AssistantRateLimiter();
  let clock = 0;
  const prisma = {
    municipality: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) =>
        where.slug === PAEZ.slug ? PAEZ : null,
      ),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AssistantController],
      providers: [
        { provide: AssistantToolsService, useValue: tools },
        { provide: AssistantChangesService, useValue: changes },
        { provide: AssistantConversationService, useValue: conversation },
        { provide: AssistantRateLimiter, useValue: rateLimiter },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    // Same as main.ts: messages may carry up to 5000 rows of context.
    setupAssistantBodyLimit(app as NestExpressApplication);
    // Stands in for JwtAuthGuard, which these tests do not load.
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { id: ADMIN_ID, email: 'admin@example.com' };
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
    tools.proposeStatusChange.mockReset();
    changes.confirm.mockReset();
    conversation.reply.mockReset();
    // Every test starts well past the previous one's minute.
    clock += 10 * 60_000;
    rateLimiter.now = () => (clock += 1);
  });

  it('requires a session on every route: none of them is public', () => {
    for (const handler of ['message', 'preview', 'confirm'] as const) {
      expect(
        Reflect.getMetadata(
          IS_PUBLIC_KEY,
          AssistantController.prototype[handler],
        ),
      ).toBeUndefined();
    }
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AssistantController)).toBe(
      undefined,
    );
  });

  it('answers 404 for an unknown municipality, without validating anything', async () => {
    const response = await request(app.getHttpServer())
      .post('/municipalities/nope/assistant/changes/preview')
      .send({ changes: [{ settlementId: 1, toStatus: 'PAGADA' }] });

    expect(response.status).toBe(404);
    expect(tools.proposeStatusChange).not.toHaveBeenCalled();
  });

  it('previews the changes in the active municipality', async () => {
    tools.proposeStatusChange.mockResolvedValue({ accepted: [], rejected: [] });

    const response = await request(app.getHttpServer())
      .post(`${BASE}/preview`)
      .send({ changes: [{ settlementId: 123, toStatus: 'PAGADA' }] });

    expect(response.status).toBe(200);
    expect(tools.proposeStatusChange).toHaveBeenCalledWith(PAEZ.id, [
      { settlementId: 123, toStatus: 'PAGADA' },
    ]);
  });

  it('confirms with the authenticated administrator and the note', async () => {
    changes.confirm.mockResolvedValue({ applied: [], unchanged: [] });

    const response = await request(app.getHttpServer())
      .post(`${BASE}/confirm`)
      .send({
        changes: [{ settlementId: 456, toStatus: 'ACUERDO_DE_PAGO' }],
        note: 'firmó el lunes',
      });

    expect(response.status).toBe(200);
    expect(changes.confirm).toHaveBeenCalledWith(
      PAEZ.id,
      ADMIN_ID,
      [{ settlementId: 456, toStatus: 'ACUERDO_DE_PAGO' }],
      'firmó el lunes',
    );
  });

  it('passes the 409 with the rejected changes through', async () => {
    const rejected = [
      { settlementId: 12, reason: 'TRANSITION_NOT_ALLOWED', allowed: [] },
    ];
    changes.confirm.mockRejectedValue(
      new ConflictException(
        errorBody(ErrorCode.ASSISTANT_CHANGES_REJECTED, 'No change applied.', {
          rejected,
        }),
      ),
    );

    const response = await request(app.getHttpServer())
      .post(`${BASE}/confirm`)
      .send({ changes: [{ settlementId: 12, toStatus: 'PRESCRITA' }] });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: ErrorCode.ASSISTANT_CHANGES_REJECTED,
      details: { rejected },
    });
  });

  it.each([
    ['no changes', { changes: [] }],
    ['an unknown status', { changes: [{ settlementId: 1, toStatus: 'X' }] }],
    [
      'a field the body does not have',
      {
        changes: [{ settlementId: 1, toStatus: 'PAGADA' }],
        administratorId: 1,
      },
    ],
    [
      'a note over 500 characters',
      {
        changes: [{ settlementId: 1, toStatus: 'PAGADA' }],
        note: 'x'.repeat(501),
      },
    ],
  ])('answers 400 for %s, without calling the service', async (_, body) => {
    const response = await request(app.getHttpServer())
      .post(`${BASE}/confirm`)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe(ErrorCode.REQUEST_VALIDATION_FAILED);
    expect(changes.confirm).not.toHaveBeenCalled();
  });

  describe('POST messages', () => {
    const MESSAGES = '/municipalities/paez/assistant/messages';

    it('answers with the reply and the proposals, for the active municipality', async () => {
      const answer = { reply: 'Listo.', proposals: null };
      conversation.reply.mockResolvedValue(answer);

      const response = await request(app.getHttpServer())
        .post(MESSAGES)
        .send({
          message: 'Marca como pagada la 123',
          history: [{ role: 'assistant', content: 'Hola' }],
          context: {
            paymentOrderRows: [{ cadastralCode: '155140001', period: 2020 }],
          },
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual(answer);
      expect(conversation.reply).toHaveBeenCalledWith(
        PAEZ.id,
        expect.objectContaining({ message: 'Marca como pagada la 123' }),
        expect.any(String),
      );
    });

    it('takes the 5000 rows of a payment orders Excel as context', async () => {
      conversation.reply.mockResolvedValue({ reply: 'ok', proposals: null });

      const response = await request(app.getHttpServer())
        .post(MESSAGES)
        .send({
          message: '¿Qué periodos faltan?',
          context: {
            paymentOrderRows: Array.from({ length: 5000 }, (_, i) => ({
              cadastralCode: `15514000100020003${String(i).padStart(4, '0')}`,
              period: 2020,
            })),
          },
        });

      expect(response.status).toBe(200);
    });

    it.each([
      ['no message', { message: '' }],
      [
        'more than 10 turns of history',
        {
          message: 'Hola',
          history: Array.from({ length: 11 }, () => ({
            role: 'user',
            content: 'x',
          })),
        },
      ],
      [
        'a turn with another role',
        { message: 'Hola', history: [{ role: 'system', content: 'x' }] },
      ],
      [
        'more than 5000 rows of context',
        {
          message: 'Hola',
          context: {
            paymentOrderRows: Array.from({ length: 5001 }, () => ({
              cadastralCode: '1',
              period: 2020,
            })),
          },
        },
      ],
    ])('answers 400 for %s', async (_, body) => {
      const response = await request(app.getHttpServer())
        .post(MESSAGES)
        .send(body);

      expect(response.status).toBe(400);
      expect(conversation.reply).not.toHaveBeenCalled();
    });

    it('answers 429 with Retry-After after 20 messages in a minute, without calling the model', async () => {
      conversation.reply.mockResolvedValue({ reply: 'ok', proposals: null });
      const server = app.getHttpServer();
      for (let i = 0; i < 20; i++) {
        await request(server).post(MESSAGES).send({ message: 'Hola' });
      }
      conversation.reply.mockClear();

      const response = await request(server)
        .post(MESSAGES)
        .send({ message: 'Hola' });

      expect(response.status).toBe(429);
      expect(response.body.code).toBe(ErrorCode.ASSISTANT_RATE_LIMITED);
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
      expect(conversation.reply).not.toHaveBeenCalled();
    });

    it('passes the 503 of an unavailable model through', async () => {
      conversation.reply.mockRejectedValue(
        new ServiceUnavailableException(
          errorBody(ErrorCode.ASSISTANT_UNAVAILABLE, 'Not available.'),
        ),
      );

      const response = await request(app.getHttpServer())
        .post(MESSAGES)
        .send({ message: 'Hola' });

      expect(response.status).toBe(503);
      expect(response.body.code).toBe(ErrorCode.ASSISTANT_UNAVAILABLE);
    });
  });
});
