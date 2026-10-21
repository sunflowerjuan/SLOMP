import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

// A caller-supplied id is only kept when it is short and plain, so it cannot
// be used to forge or break log lines.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;
const MAX_LOGGED_PATH_LENGTH = 200;

export interface RequestLogLine {
  time: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId: string;
}

export type LogSink = (line: string) => void;

const stdout: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

// One JSON line per request, written when the response is done. It records
// the method, the path WITHOUT its query string, the status, the duration and
// the request id -- never a body, a header or a parameter: the public
// consultation carries the predio's data in them. Nothing here reads
// `req.body`, `req.query` or `req.params`.
export function requestLogger(sink: LogSink = stdout) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startedAt = process.hrtime.bigint();
    const incoming = req.header(REQUEST_ID_HEADER);
    const requestId =
      incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const line: RequestLogLine = {
        time: new Date().toISOString(),
        method: req.method,
        path: req.originalUrl.split('?')[0].slice(0, MAX_LOGGED_PATH_LENGTH),
        status: res.statusCode,
        durationMs:
          Math.round(Number(process.hrtime.bigint() - startedAt) / 1e4) / 100,
        requestId,
      };
      sink(JSON.stringify(line));
    });
    next();
  };
}

export function setupRequestLogging(app: NestExpressApplication): void {
  app.use(requestLogger());
}
