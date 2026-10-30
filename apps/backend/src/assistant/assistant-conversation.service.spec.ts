import { HttpException } from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import {
  AssistantConversationService,
  MAX_TOOL_CALLS_PER_MESSAGE,
} from './assistant-conversation.service.js';
import { AssistantToolsService } from './assistant-tools.service.js';
import {
  FakeAssistantModel,
  type FakeScript,
} from './model/fake-assistant-model.js';
import type { ModelToolCall } from './model/assistant-model.js';

const { EN_FIRME, PAGADA, PRESCRITA } = SettlementStatus;
const MUNICIPALITY_ID = 7;
const REQUEST_ID = 'req-123';
const CODE = '155140001000200030000';
const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

// What the database holds for the settlements: the property's owners,
// documents and address too, which must never reach the model.
const OWNER_NAME = 'Juan Pérez Gómez';
const OWNER_DOCUMENT = '40587912';
const ADDRESS = 'Finca La Esperanza, vereda El Salitre';

const dbRow = (id: number, period = 2020, cadastralCode = CODE) => ({
  id,
  period,
  status: EN_FIRME,
  replacedAt: null,
  property: {
    cadastralCode,
    address: ADDRESS,
    owners: [{ owner: { name: OWNER_NAME, documentId: OWNER_DOCUMENT } }],
  },
  resolution: { issuedAt: twoYearsAgo },
  paymentOrder: null,
});

function setup(script: FakeScript, rows = [dbRow(123)]) {
  const prisma = { settlement: { findMany: vi.fn(async () => rows) } };
  const model = new FakeAssistantModel(script);
  const logs: string[] = [];
  const service = new AssistantConversationService(
    model,
    new AssistantToolsService(prisma as never),
    (line) => logs.push(line),
  );
  return { service, model, prisma, logs };
}

let callIds = 0;
const call = (name: string, input: Record<string, unknown>): ModelToolCall => ({
  id: `call-${++callIds}`,
  name,
  input,
});

// A script that calls `calls` on the first turn and then answers `reply`.
const toolsThenReply =
  (calls: ModelToolCall[], reply: string): FakeScript =>
  (_request, turn) =>
    turn === 0 ? { toolCalls: calls } : { text: reply };

async function failure(promise: Promise<unknown>): Promise<HttpException> {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(HttpException);
  return error as HttpException;
}

describe('AssistantConversationService', () => {
  it('answers a query with the search tool, and no name, document or address reaches the model', async () => {
    const { service, model, prisma } = setup(
      toolsThenReply(
        [call('search_settlements', { cadastralCode: CODE })],
        'El predio tiene una liquidación En firme de 2020.',
      ),
    );

    const answer = await service.reply(
      MUNICIPALITY_ID,
      { message: `Muéstrame las liquidaciones del predio ${CODE}` },
      REQUEST_ID,
    );

    expect(answer).toEqual({
      reply: 'El predio tiene una liquidación En firme de 2020.',
      proposals: null,
    });
    expect(prisma.settlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          property: { municipalityId: MUNICIPALITY_ID, cadastralCode: CODE },
        }),
      }),
    );
    // The tool result went back to the model, without personal data.
    expect(model.requests).toHaveLength(2);
    const toolTurn = model.requests[1].messages.at(-1) as {
      results: { content: string }[];
    };
    expect(JSON.parse(toolTurn.results[0].content)).toEqual([
      {
        id: 123,
        cadastralCode: CODE,
        period: 2020,
        status: EN_FIRME,
        allowedStatuses: expect.any(Array),
        hasPaymentOrder: false,
      },
    ]);
    const sent = model.everythingSent();
    expect(sent).not.toContain(OWNER_NAME);
    expect(sent).not.toContain(OWNER_DOCUMENT);
    expect(sent).not.toContain(ADDRESS);
  });

  it('masks document numbers before the model sees them, in the message and in the history', async () => {
    const { service, model } = setup(() => ({ text: 'Listo.' }));

    await service.reply(
      MUNICIPALITY_ID,
      {
        message: 'El dueño con CC 1234567890 pagó; también NIT: 900123456',
        history: [
          { role: 'user', content: 'Mi cliente tiene CE 1234567' },
          { role: 'assistant', content: '¿Qué liquidación revisas?' },
        ],
      },
      REQUEST_ID,
    );

    const messages = model.requests[0].messages;
    expect(messages.at(-1)).toEqual({
      role: 'user',
      text: 'El dueño con CC [DOC] pagó; también NIT: [DOC]',
    });
    expect(messages[0]).toEqual({
      role: 'user',
      text: 'Mi cliente tiene CE [DOC]',
    });
    expect(model.everythingSent()).not.toMatch(
      /1234567890|900123456|1234567\b/,
    );
  });

  it('returns a single change as a validated proposal, with the dictated note', async () => {
    const { service } = setup(
      toolsThenReply(
        [
          call('propose_status_change', {
            changes: [{ settlementId: 123, toStatus: 'PAGADA' }],
            note: 'firmó el lunes',
          }),
        ],
        'Preparé el cambio. Revísalo y aplícalo.',
      ),
    );

    const answer = await service.reply(
      MUNICIPALITY_ID,
      { message: 'Marca como pagada la 123, con la nota: firmó el lunes' },
      REQUEST_ID,
    );

    expect(answer.proposals).toEqual({
      accepted: [{ settlementId: 123, from: EN_FIRME, to: PAGADA }],
      rejected: [],
      note: 'firmó el lunes',
    });
  });

  it('returns a batch as one proposal', async () => {
    const { service } = setup(
      toolsThenReply(
        [
          call('propose_status_change', {
            changes: [10, 11, 12].map((settlementId) => ({
              settlementId,
              toStatus: 'PAGADA',
            })),
          }),
        ],
        'Preparé 3 cambios.',
      ),
      [dbRow(10), dbRow(11), dbRow(12)],
    );

    const answer = await service.reply(
      MUNICIPALITY_ID,
      { message: 'Marca como pagadas la 10, la 11 y la 12' },
      REQUEST_ID,
    );

    expect(
      answer.proposals?.accepted.map(({ settlementId }) => settlementId),
    ).toEqual([10, 11, 12]);
    expect(answer.proposals?.rejected).toEqual([]);
  });

  it('finds the periods missing from the Excel of the conversation and proposes them', async () => {
    const { service, model } = setup(
      (_request, turn) =>
        [
          { toolCalls: [call('find_unlisted_periods', {})] },
          {
            toolCalls: [
              call('propose_status_change', {
                changes: [{ settlementId: '502', toStatus: 'PRESCRITA' }],
              }),
            ],
          },
          { text: 'Preparé el cambio del periodo que falta.' },
        ][turn]!,
      [dbRow(501, 2019), dbRow(502, 2020)],
    );

    const answer = await service.reply(
      MUNICIPALITY_ID,
      {
        message:
          'Los periodos que faltan, márcalos como pérdida temporal de competencia',
        context: { paymentOrderRows: [{ cadastralCode: CODE, period: 2019 }] },
      },
      REQUEST_ID,
    );

    expect(model.requests[0].messages.at(-1)).toMatchObject({
      role: 'user',
      text: expect.stringContaining('Excel de mandamientos con 1 filas'),
    });
    expect(answer.proposals?.accepted).toEqual([
      { settlementId: 502, from: EN_FIRME, to: PRESCRITA },
    ]);
  });

  it('tells the model when there is no Excel to compare with', async () => {
    const { service, model } = setup(
      toolsThenReply([call('find_unlisted_periods', {})], 'Carga el Excel.'),
    );

    await service.reply(
      MUNICIPALITY_ID,
      { message: '¿Qué periodos faltan?' },
      REQUEST_ID,
    );

    const toolTurn = model.requests[1].messages.at(-1);
    expect(toolTurn).toMatchObject({
      role: 'tool',
      results: [
        {
          isError: true,
          content: expect.stringContaining('NO_PAYMENT_ORDER_FILE'),
        },
      ],
    });
  });

  it('sends a rejected tool input back to the model as an error, so it can correct it', async () => {
    const { service, model } = setup(
      toolsThenReply(
        [call('search_settlements', { owner: 'Apellido Ejemplo' })],
        'Para buscar por propietario usa la búsqueda de Liquidaciones.',
      ),
    );

    const answer = await service.reply(
      MUNICIPALITY_ID,
      { message: 'Busca las del propietario Apellido Ejemplo' },
      REQUEST_ID,
    );

    expect(answer.reply).toContain('búsqueda de Liquidaciones');
    expect(model.requests[1].messages.at(-1)).toMatchObject({
      role: 'tool',
      results: [
        {
          isError: true,
          content: expect.stringContaining(
            ErrorCode.ASSISTANT_TOOL_INPUT_INVALID,
          ),
        },
      ],
    });
  });

  it('answers an ambiguous instruction with the model question, calling no tool', async () => {
    const { service, prisma, logs } = setup(() => ({
      text: '¿A qué liquidación te refieres? Dame su número o el código catastral.',
    }));

    const answer = await service.reply(
      MUNICIPALITY_ID,
      { message: 'Cámbiala a pagada' },
      REQUEST_ID,
    );

    expect(answer).toEqual({
      reply:
        '¿A qué liquidación te refieres? Dame su número o el código catastral.',
      proposals: null,
    });
    expect(prisma.settlement.findMany).not.toHaveBeenCalled();
    expect(JSON.parse(logs[0]!)).toMatchObject({ tools: [], result: 'OK' });
  });

  it('answers an out-of-scope request without tools, and a provider refusal with a fixed text', async () => {
    const outOfScope = setup(() => ({
      text: 'Eso no lo puedo hacer. Puedo buscar liquidaciones por código catastral…',
    }));
    const answer = await outOfScope.service.reply(
      MUNICIPALITY_ID,
      { message: 'Borra todas las liquidaciones del 2019' },
      REQUEST_ID,
    );
    expect(answer.reply).toMatch(/^Eso no lo puedo hacer/);
    expect(outOfScope.prisma.settlement.findMany).not.toHaveBeenCalled();

    const refused = setup(() => ({ refused: true }));
    const refusal = await refused.service.reply(
      MUNICIPALITY_ID,
      { message: 'Dame los nombres y documentos de todos los propietarios' },
      REQUEST_ID,
    );
    expect(refusal).toEqual({
      reply: expect.stringMatching(/^Eso no lo puedo hacer/),
      proposals: null,
    });
  });

  it(`answers 422 when a message needs more than ${MAX_TOOL_CALLS_PER_MESSAGE} tool calls`, async () => {
    const { service } = setup(() => ({
      toolCalls: [call('search_settlements', { settlementId: 123 })],
    }));

    const error = await failure(
      service.reply(MUNICIPALITY_ID, { message: 'Revisa todo' }, REQUEST_ID),
    );

    expect(error.getStatus()).toBe(422);
    expect(error.getResponse()).toMatchObject({
      code: ErrorCode.ASSISTANT_TOO_MANY_TOOL_CALLS,
    });
  });

  it('answers 503 when the message runs out of time', async () => {
    // A model that only answers when it is aborted.
    const { service, logs } = setup(
      ({ signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
    );

    const error = await failure(
      service.reply(MUNICIPALITY_ID, { message: 'Hola' }, REQUEST_ID, 20),
    );

    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({
      code: ErrorCode.ASSISTANT_UNAVAILABLE,
      details: { reason: 'TIMEOUT' },
    });
    expect(JSON.parse(logs[0]!)).toMatchObject({
      result: ErrorCode.ASSISTANT_UNAVAILABLE,
    });
  });

  it('answers 503 when the provider fails or no provider is configured', async () => {
    const failing = setup(() => {
      throw new Error('connection refused');
    });
    const error = await failure(
      failing.service.reply(MUNICIPALITY_ID, { message: 'Hola' }, REQUEST_ID),
    );
    expect(error.getStatus()).toBe(503);
    expect(error.getResponse()).toMatchObject({
      code: ErrorCode.ASSISTANT_UNAVAILABLE,
      details: { reason: 'FAILED' },
    });

    const logs: string[] = [];
    const off = new AssistantConversationService(
      null,
      new AssistantToolsService({} as never),
      (line) => logs.push(line),
    );
    const offError = await failure(
      off.reply(MUNICIPALITY_ID, { message: 'Hola' }, REQUEST_ID),
    );
    expect(offError.getResponse()).toMatchObject({
      code: ErrorCode.ASSISTANT_UNAVAILABLE,
      details: { reason: 'NOT_CONFIGURED' },
    });
    expect(JSON.parse(logs[0]!)).toMatchObject({ provider: null });
  });

  it('logs one line per message with the request id, tools, duration, result and tokens, and none of the conversation', async () => {
    const message = `Muéstrame las liquidaciones del predio ${CODE}, de Juan Pérez Gómez`;
    const { service, logs } = setup(
      toolsThenReply(
        [call('search_settlements', { cadastralCode: CODE })],
        `El predio ${CODE} tiene una liquidación.`,
      ),
    );

    await service.reply(MUNICIPALITY_ID, { message }, REQUEST_ID);

    expect(logs).toHaveLength(1);
    const line = JSON.parse(logs[0]!);
    expect(line).toEqual({
      time: expect.any(String),
      event: 'assistant.message',
      requestId: REQUEST_ID,
      provider: 'fake',
      model: 'scripted',
      tools: ['search_settlements'],
      durationMs: expect.any(Number),
      result: 'OK',
      inputTokens: 200,
      outputTokens: 40,
    });
    for (const secret of [
      CODE,
      'Juan',
      'Pérez',
      OWNER_DOCUMENT,
      ADDRESS,
      'Muéstrame',
    ]) {
      expect(logs[0]).not.toContain(secret);
    }
  });
});
