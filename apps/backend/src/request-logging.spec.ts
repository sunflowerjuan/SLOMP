import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { requestLogger, type RequestLogLine } from './request-logging.js';

function run(
  req: Partial<Request> & { originalUrl: string; method: string },
  headers: Record<string, string> = {},
) {
  const lines: string[] = [];
  const res = Object.assign(new EventEmitter(), {
    statusCode: 201,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
  });
  const request = {
    ...req,
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
  const next = vi.fn();

  requestLogger((line) => lines.push(line))(
    request,
    res as unknown as Response,
    next,
  );
  res.emit('finish');
  return { lines, res, next };
}

describe('requestLogger', () => {
  it('writes one JSON line with method, path, status, duration and request id', () => {
    const { lines, next } = run({
      method: 'GET',
      originalUrl: '/municipalities/paez/settlements',
    });

    expect(next).toHaveBeenCalledOnce();
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0]) as RequestLogLine;
    expect(line).toMatchObject({
      method: 'GET',
      path: '/municipalities/paez/settlements',
      status: 201,
    });
    expect(line.durationMs).toBeGreaterThanOrEqual(0);
    expect(line.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(line).sort()).toEqual([
      'durationMs',
      'method',
      'path',
      'requestId',
      'status',
      'time',
    ]);
  });

  it('drops the query string and never reads the body or the parameters', () => {
    const { lines } = run({
      method: 'POST',
      originalUrl: '/consulta-publica/paez?cadastralCode=155140001000000010001',
      body: { cadastralCode: '155140001000000010001', ownerName: 'Ana Pérez' },
      query: { cadastralCode: '155140001000000010001' },
    });

    expect(JSON.parse(lines[0]).path).toBe('/consulta-publica/paez');
    expect(lines[0]).not.toContain('155140001000000010001');
    expect(lines[0]).not.toContain('Ana');
  });

  it('keeps a plain caller request id and answers with it', () => {
    const { lines, res } = run(
      { method: 'GET', originalUrl: '/health' },
      { 'x-request-id': 'probe-42' },
    );

    expect(JSON.parse(lines[0]).requestId).toBe('probe-42');
    expect(res.headers['X-Request-Id']).toBe('probe-42');
  });

  it('replaces a caller request id that could break a log line', () => {
    const { lines } = run(
      { method: 'GET', originalUrl: '/health' },
      { 'x-request-id': 'a"}\n{"forged":true' },
    );

    expect(lines[0]).not.toContain('forged');
    expect(lines[0].split('\n')).toHaveLength(1);
  });
});
