import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createHttpServer, type HttpDeps } from '../src/http.ts';
import { createSlotPool } from '../src/slots.ts';
import { createTemplateCache } from '../src/templates.ts';
import { JobError } from '../src/errors.ts';
import { FAKE_PDF, FakeBlobs, fakeSlot, templateFixture } from './fakes.ts';

const KEY = 'test-key';
let close: (() => void) | undefined;

afterEach(() => close?.());

async function start(overrides: Partial<HttpDeps> = {}) {
  const { template, sha256 } = templateFixture();
  const blobs = new FakeBlobs();
  blobs.files.set('templates/paez/liquidacion/1.docx', template);
  const server = createHttpServer({
    serviceKey: KEY,
    renderPool: createSlotPool([fakeSlot()]),
    getTemplate: createTemplateCache(blobs),
    log: () => {},
    ...overrides,
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  close = () => server.close();
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const body = {
    schemaVersion: 1,
    documentType: 'LIQUIDACION',
    template: { blob: 'templates/paez/liquidacion/1.docx', sha256 },
    data: { resolutionNumber: '2026-0042', rows: [] },
  };
  const render = (payload: unknown = body, key: string | null = KEY) =>
    fetch(`${base}/render`, {
      method: 'POST',
      headers: key ? { 'X-Internal-Key': key } : {},
      body: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });
  return { base, body, render };
}

describe('GET /health', () => {
  it('answers ok', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

describe('unknown routes', () => {
  it('answer NOT_FOUND', async () => {
    const { base } = await start();
    for (const response of [
      await fetch(`${base}/nope`),
      await fetch(`${base}/health`, { method: 'POST' }),
      await fetch(`${base}/render`),
    ]) {
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ code: 'NOT_FOUND' });
    }
  });

  it('never put a line break from the URL into the log', async () => {
    const lines: string[] = [];
    const { base } = await start({ log: (message) => lines.push(message) });
    const response = await fetch(`${base}/x%0AFAKE%20log%20line%0D`);
    expect(response.status).toBe(404);
    for (const line of lines) expect(line).not.toMatch(/[\r\n]/);
  });
});

describe('a render that throws', () => {
  it('is logged once, answers 500 and keeps the server up', async () => {
    const lines: string[] = [];
    const pool = createSlotPool([fakeSlot()]);
    pool.tryAcquire = () => {
      throw new Error('boom');
    };
    const { base, render } = await start({
      renderPool: pool,
      log: (message) => lines.push(message),
    });
    const response = await render();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: 'INTERNAL_ERROR' });
    expect(lines).toEqual(['unhandled POST /render: boom']);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });
});

describe('POST /render', () => {
  it('returns the PDF', async () => {
    const { render } = await start();
    const response = await render();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(FAKE_PDF);
  });

  it('requires the internal key', async () => {
    const { render } = await start();
    expect((await render(undefined, null)).status).toBe(401);
    expect((await render(undefined, 'wrong')).status).toBe(401);
  });

  it('rejects a body outside the contract', async () => {
    const { render, body } = await start();
    const notJson = await render('{');
    expect(notJson.status).toBe(400);
    const badShape = await render({ ...body, documentType: 'OTHER' });
    expect(await badShape.json()).toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('answers BUSY when every render slot is taken', async () => {
    const pool = createSlotPool([fakeSlot()]);
    pool.tryAcquire();
    const { render } = await start({ renderPool: pool });
    const response = await render();
    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('1');
    expect(await response.json()).toEqual({ code: 'BUSY' });
  });

  it('maps template and conversion failures to the contract codes', async () => {
    const timeout = fakeSlot(() => [
      new JobError('PDF_CONVERSION_TIMEOUT', 'timed out'),
    ]);
    const { render, body } = await start({
      renderPool: createSlotPool([timeout]),
    });
    expect((await render()).status).toBe(504);

    const wrongHash = await render({
      ...body,
      template: { ...body.template, sha256: 'c'.repeat(64) },
    });
    expect(wrongHash.status).toBe(503);
    expect(await wrongHash.json()).toMatchObject({
      code: 'TEMPLATE_UNAVAILABLE',
    });
  });

  it('is unavailable when Storage is not configured', async () => {
    const { render } = await start({ getTemplate: undefined });
    const response = await render();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'TEMPLATE_UNAVAILABLE',
    });
  });
});
