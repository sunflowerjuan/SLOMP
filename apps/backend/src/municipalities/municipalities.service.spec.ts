import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import { MunicipalitiesService } from './municipalities.service.js';
import type { MunicipalityContext } from './municipality-context.js';

const PAEZ: MunicipalityContext = {
  id: 1,
  slug: 'paez',
  name: 'Páez',
  state: 'Boyacá',
  daneCode: '15514',
};

function buildPrisma(
  options: {
    takenDane?: string;
    takenSlug?: string;
    counts?: Record<string, number>;
  } = {},
) {
  return {
    municipality: {
      findMany: vi.fn().mockResolvedValue([PAEZ]),
      findUnique: vi.fn(
        async ({ where }: { where: Record<string, unknown> }) => {
          if ('daneCode' in where) {
            return where.daneCode === options.takenDane ? { id: 9 } : null;
          }
          if ('slug' in where) {
            return where.slug === options.takenSlug ? { id: 9 } : null;
          }
          // hasData(): the _count lookup by id
          return {
            _count: {
              properties: 0,
              owners: 0,
              resolutions: 0,
              taxRollImports: 0,
              ...options.counts,
            },
          };
        },
      ),
      create: vi.fn(async ({ data }: { data: object }) => ({ id: 2, ...data })),
      update: vi.fn(async ({ data }: { data: object }) => ({
        ...PAEZ,
        ...data,
      })),
    },
  };
}

async function errorCodeOf(promise: Promise<unknown>): Promise<unknown> {
  const error = (await promise.catch((e) => e)) as {
    getResponse?: () => { code?: string };
  };
  return error?.getResponse?.().code;
}

describe('MunicipalitiesService', () => {
  describe('create', () => {
    it('creates a municipality and suggests the slug from the name when none is sent', async () => {
      const prisma = buildPrisma();
      const service = new MunicipalitiesService(prisma as never);

      const created = await service.create({
        name: ' Páez ',
        state: 'Cauca',
        daneCode: '19517',
      });

      expect(prisma.municipality.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            name: 'Páez',
            state: 'Cauca',
            daneCode: '19517',
            slug: 'paez',
          },
        }),
      );
      expect(created.slug).toBe('paez');
    });

    it('keeps a slug the caller edited', async () => {
      const prisma = buildPrisma();
      const service = new MunicipalitiesService(prisma as never);

      await service.create({
        name: 'Páez',
        state: 'Cauca',
        daneCode: '19517',
        slug: 'paez-cauca',
      });

      expect(prisma.municipality.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ slug: 'paez-cauca' }),
        }),
      );
    });

    it.each(['1551', '155140', 'abcde', ''])(
      'rejects the DANE code "%s" with MUNICIPALITY_INVALID_DANE',
      async (daneCode) => {
        const prisma = buildPrisma();
        const service = new MunicipalitiesService(prisma as never);

        const promise = service.create({ name: 'X', state: 'Y', daneCode });

        await expect(promise).rejects.toBeInstanceOf(BadRequestException);
        expect(await errorCodeOf(promise)).toBe(
          ErrorCode.MUNICIPALITY_INVALID_DANE,
        );
        expect(prisma.municipality.create).not.toHaveBeenCalled();
      },
    );

    it.each(['Paez', 'paez cauca', '-paez', 'paez--x'])(
      'rejects the slug "%s" with MUNICIPALITY_INVALID_SLUG',
      async (slug) => {
        const service = new MunicipalitiesService(buildPrisma() as never);

        const promise = service.create({
          name: 'X',
          state: 'Y',
          daneCode: '15514',
          slug,
        });

        expect(await errorCodeOf(promise)).toBe(
          ErrorCode.MUNICIPALITY_INVALID_SLUG,
        );
      },
    );

    it('rejects a name that cannot produce a slug', async () => {
      const service = new MunicipalitiesService(buildPrisma() as never);

      const promise = service.create({
        name: '***',
        state: 'Y',
        daneCode: '15514',
      });

      expect(await errorCodeOf(promise)).toBe(
        ErrorCode.MUNICIPALITY_INVALID_SLUG,
      );
    });

    it('rejects a DANE code that is already taken with a 409', async () => {
      const prisma = buildPrisma({ takenDane: '15514' });
      const service = new MunicipalitiesService(prisma as never);

      const promise = service.create({
        name: 'Otro',
        state: 'Y',
        daneCode: '15514',
      });

      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      expect(await errorCodeOf(promise)).toBe(
        ErrorCode.MUNICIPALITY_DANE_TAKEN,
      );
    });

    it('rejects a slug that is already taken, so two Páez need different slugs', async () => {
      const prisma = buildPrisma({ takenSlug: 'paez' });
      const service = new MunicipalitiesService(prisma as never);

      const promise = service.create({
        name: 'Páez',
        state: 'Cauca',
        daneCode: '19517',
      });

      expect(await errorCodeOf(promise)).toBe(
        ErrorCode.MUNICIPALITY_SLUG_TAKEN,
      );
    });

    it('turns a unique-index race into the same 409', async () => {
      const prisma = buildPrisma();
      prisma.municipality.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['slug'] },
        }),
      );
      const service = new MunicipalitiesService(prisma as never);

      const promise = service.create({
        name: 'Páez',
        state: 'Cauca',
        daneCode: '19517',
      });

      expect(await errorCodeOf(promise)).toBe(
        ErrorCode.MUNICIPALITY_SLUG_TAKEN,
      );
    });
  });

  describe('update', () => {
    it('always lets the name and state change, even with data loaded', async () => {
      const prisma = buildPrisma({ counts: { properties: 1004 } });
      const service = new MunicipalitiesService(prisma as never);

      await service.update(PAEZ, { name: 'Páez (Boyacá)', state: 'Boyacá' });

      expect(prisma.municipality.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PAEZ.id },
          data: { name: 'Páez (Boyacá)', state: 'Boyacá' },
        }),
      );
    });

    it.each([
      ['slug', { slug: 'paez-boyaca' }],
      ['daneCode', { daneCode: '15515' }],
    ])(
      'rejects changing the %s once there is data, with MUNICIPALITY_IMMUTABLE_FIELD',
      async (_field, patch) => {
        const prisma = buildPrisma({ counts: { properties: 1 } });
        const service = new MunicipalitiesService(prisma as never);

        const promise = service.update(PAEZ, patch);

        await expect(promise).rejects.toBeInstanceOf(ConflictException);
        expect(await errorCodeOf(promise)).toBe(
          ErrorCode.MUNICIPALITY_IMMUTABLE_FIELD,
        );
        expect(prisma.municipality.update).not.toHaveBeenCalled();
      },
    );

    it.each(['owners', 'resolutions', 'taxRollImports'])(
      'counts %s as data too',
      async (table) => {
        const prisma = buildPrisma({ counts: { [table]: 1 } });
        const service = new MunicipalitiesService(prisma as never);

        const promise = service.update(PAEZ, { slug: 'otro' });

        expect(await errorCodeOf(promise)).toBe(
          ErrorCode.MUNICIPALITY_IMMUTABLE_FIELD,
        );
      },
    );

    it('accepts the same slug and DANE code again, since nothing changes', async () => {
      const prisma = buildPrisma({ counts: { properties: 1 } });
      const service = new MunicipalitiesService(prisma as never);

      await service.update(PAEZ, {
        slug: 'paez',
        daneCode: '15514',
        name: 'P',
      });

      expect(prisma.municipality.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'P' } }),
      );
    });

    it('lets the slug and DANE code change while the municipality is still empty', async () => {
      const prisma = buildPrisma();
      const service = new MunicipalitiesService(prisma as never);

      await service.update(PAEZ, { slug: 'paez-boyaca', daneCode: '15515' });

      expect(prisma.municipality.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { slug: 'paez-boyaca', daneCode: '15515' },
        }),
      );
    });

    it('validates and checks availability of the new slug and DANE code', async () => {
      const prisma = buildPrisma({ takenDane: '19517' });
      const service = new MunicipalitiesService(prisma as never);

      expect(
        await errorCodeOf(service.update(PAEZ, { slug: 'No Valido' })),
      ).toBe(ErrorCode.MUNICIPALITY_INVALID_SLUG);
      expect(await errorCodeOf(service.update(PAEZ, { daneCode: '12' }))).toBe(
        ErrorCode.MUNICIPALITY_INVALID_DANE,
      );
      expect(
        await errorCodeOf(service.update(PAEZ, { daneCode: '19517' })),
      ).toBe(ErrorCode.MUNICIPALITY_DANE_TAKEN);
    });
  });

  it('lists the municipalities for the selector', async () => {
    const prisma = buildPrisma();
    const service = new MunicipalitiesService(prisma as never);

    await expect(service.list()).resolves.toEqual([PAEZ]);
  });
});
