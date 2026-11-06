import type { Response } from 'express';
import { vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HEALTH_DB_TIMEOUT_MS, HealthController } from './health.controller.js';

describe('HealthController', () => {
  const queryRaw = vi.fn();
  const status = vi.fn();
  const res = { status } as unknown as Response;
  const controller = new HealthController({
    $queryRaw: queryRaw,
  } as unknown as PrismaService);

  beforeEach(() => {
    queryRaw.mockReset();
    status.mockReset();
    vi.spyOn(controller['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers 200 { status: "ok" } when the database responds', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(controller.check(res)).resolves.toEqual({ status: 'ok' });
    expect(status).not.toHaveBeenCalled();
  });

  it('answers 503 { status: "unavailable" } when the query fails, without the error text', async () => {
    queryRaw.mockRejectedValue(
      new Error('connect ECONNREFUSED db.internal.example:5432'),
    );

    const body = await controller.check(res);

    expect(status).toHaveBeenCalledWith(503);
    expect(body).toEqual({ status: 'unavailable' });
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('answers 503 when the database does not respond within the deadline', async () => {
    vi.useFakeTimers();
    queryRaw.mockReturnValue(new Promise(() => undefined));

    const pending = controller.check(res);
    await vi.advanceTimersByTimeAsync(HEALTH_DB_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({ status: 'unavailable' });
    expect(status).toHaveBeenCalledWith(503);
  });
});
