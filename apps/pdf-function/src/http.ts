import { createHash, timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { parseRenderRequest } from './contract.ts';
import { JobError } from './errors.ts';
import { renderDocx } from './render.ts';
import type { SlotPool } from './slots.ts';
import type { Slot } from './soffice.ts';
import type { GetTemplate } from './templates.ts';

export interface HttpDeps {
  serviceKey: string;
  renderPool: SlotPool<Slot>;
  /** Undefined when Storage isn't configured: /render can't fetch templates. */
  getTemplate: GetTemplate | undefined;
  log?: (message: string) => void;
}

const MAX_RENDER_BODY = 1024 * 1024;

class TooLarge extends Error {}

function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new TooLarge());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendPdf(res: ServerResponse, pdf: Buffer): void {
  res.writeHead(200, { 'Content-Type': 'application/pdf' });
  res.end(pdf);
}

// Hashing first gives equal-length inputs, which timingSafeEqual requires.
function keyMatches(
  given: string | string[] | undefined,
  expected: string,
): boolean {
  if (typeof given !== 'string') return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

// HTTP status and public code for each failure of the render pipeline
// (contract section 9).
const RENDER_ERRORS: Record<JobError['code'], [number, string]> = {
  INVALID_MESSAGE: [400, 'INVALID_REQUEST'],
  PDF_TEMPLATE_UNAVAILABLE: [503, 'TEMPLATE_UNAVAILABLE'],
  PDF_STORAGE_UNAVAILABLE: [503, 'TEMPLATE_UNAVAILABLE'],
  PDF_TEMPLATE_INVALID: [500, 'TEMPLATE_INVALID'],
  TEMPLATE_RENDER_FAILED: [422, 'TEMPLATE_RENDER_FAILED'],
  PDF_CONVERSION_TIMEOUT: [504, 'CONVERSION_TIMEOUT'],
  PDF_CONVERSION_FAILED: [500, 'CONVERSION_FAILED'],
  BULK_ZIP_INCOMPLETE: [500, 'CONVERSION_FAILED'],
};

async function handleRender(
  deps: HttpDeps,
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (!keyMatches(req.headers['x-internal-key'], deps.serviceKey)) {
    return sendJson(res, 401, { code: 'UNAUTHORIZED' });
  }
  let body: unknown;
  try {
    body = JSON.parse((await readBody(req, MAX_RENDER_BODY)).toString('utf8'));
  } catch (error) {
    return error instanceof TooLarge
      ? sendJson(res, 413, { code: 'TOO_LARGE' })
      : sendJson(res, 400, {
          code: 'INVALID_REQUEST',
          message: 'Body is not valid JSON.',
        });
  }
  if (!deps.getTemplate) {
    return sendJson(res, 503, {
      code: 'TEMPLATE_UNAVAILABLE',
      message: 'Storage is not configured on this service.',
    });
  }
  const slot = deps.renderPool.tryAcquire();
  if (!slot) {
    res.setHeader('Retry-After', '1');
    return sendJson(res, 503, { code: 'BUSY' });
  }
  try {
    const request = parseRenderRequest(body);
    const template = await deps.getTemplate(request.template);
    const [pdf] = await slot.convert([renderDocx(template, request.data)]);
    if (pdf instanceof JobError) throw pdf;
    sendPdf(res, pdf!);
  } catch (error) {
    const jobError =
      error instanceof JobError
        ? error
        : new JobError(
            'PDF_STORAGE_UNAVAILABLE',
            'Storage operation failed.',
            undefined,
            {
              cause: error,
            },
          );
    const [status, code] = RENDER_ERRORS[jobError.code];
    (deps.log ?? console.log)(
      `render failed: ${jobError.code} ${jobError.message}`,
    );
    sendJson(res, status, { code, message: jobError.message });
  } finally {
    deps.renderPool.release(slot);
  }
}

export function createHttpServer(deps: HttpDeps) {
  return createServer((req, res) => {
    const route = `${req.method} ${req.url}`;
    const handled =
      route === 'GET /health'
        ? Promise.resolve(sendJson(res, 200, { status: 'ok' }))
        : route === 'POST /render'
          ? handleRender(deps, req, res)
          : Promise.resolve(sendJson(res, 404, { code: 'NOT_FOUND' }));
    handled.catch((error) => {
      (deps.log ?? console.log)(
        `unhandled ${route}: ${(error as Error).message}`,
      );
      if (!res.headersSent) sendJson(res, 500, { code: 'INTERNAL_ERROR' });
    });
  });
}
