import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import { MunicipalityGuard } from './municipality.guard.js';

const PAEZ = {
  id: 1,
  slug: 'paez',
  name: 'Páez',
  state: 'Boyacá',
  daneCode: '15514',
};

function contextFor(request: object) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as never;
}

describe('MunicipalityGuard', () => {
  it('puts the municipality of :slug on the request', async () => {
    const findUnique = vi.fn().mockResolvedValue(PAEZ);
    const guard = new MunicipalityGuard({
      municipality: { findUnique },
    } as never);
    const request: { params: { slug: string }; municipality?: unknown } = {
      params: { slug: 'paez' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'paez' } }),
    );
    expect(request.municipality).toEqual(PAEZ);
  });

  it('answers 404 MUNICIPALITY_NOT_FOUND for an unknown slug', async () => {
    const guard = new MunicipalityGuard({
      municipality: { findUnique: vi.fn().mockResolvedValue(null) },
    } as never);

    const error = await guard
      .canActivate(contextFor({ params: { slug: 'nope' } }))
      .catch((e) => e);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse().code).toBe(ErrorCode.MUNICIPALITY_NOT_FOUND);
  });

  it('answers 404 when the route has no :slug, without querying', async () => {
    const findUnique = vi.fn();
    const guard = new MunicipalityGuard({
      municipality: { findUnique },
    } as never);

    await expect(
      guard.canActivate(contextFor({ params: {} })),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
