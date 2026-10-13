import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { GenerateLiquidationPdfService } from '../resolutions/generate-liquidation-pdf.service.js';
import {
  PUBLIC_QUERY_LIMIT,
  PUBLIC_QUERY_TTL_MS,
  PublicSettlementQueryController,
} from './public-settlement-query.controller.js';
import { PublicSettlementQueryService } from './public-settlement-query.service.js';

const MUNICIPALITIES: Record<string, { id: number; name: string }> = {
  paez: { id: 1, name: 'Páez' },
  'paez-cauca': { id: 2, name: 'Páez (Cauca)' },
};

// settlementId -> municipality id it belongs to.
const SETTLEMENT_OWNER: Record<number, number> = { 10: 1, 20: 2 };

const CRITERIA = { cadastralCode: '001', address: 'Main Street' };

async function createApp() {
  const generateForSettlement = vi.fn(async () => ({
    pdf: Buffer.from('%PDF-fake'),
    resolutionNumber: '2026-0001',
  }));
  const queryBySlug = vi.fn(async (slug: string) =>
    MUNICIPALITIES[slug] ? [{ settlementId: 1 }] : [],
  );
  const module = await Test.createTestingModule({
    imports: [
      ThrottlerModule.forRoot([
        { ttl: PUBLIC_QUERY_TTL_MS, limit: PUBLIC_QUERY_LIMIT },
      ]),
    ],
    controllers: [PublicSettlementQueryController],
    providers: [
      {
        provide: PublicSettlementQueryService,
        useValue: {
          queryBySlug,
          findPublicMunicipality: async (slug: string) =>
            MUNICIPALITIES[slug] ? { ...MUNICIPALITIES[slug], slug } : null,
          // Mirrors the real service: a settlement only matches inside its
          // own municipality.
          query: async (municipalityId: number) =>
            Object.entries(SETTLEMENT_OWNER)
              .filter(([, owner]) => owner === municipalityId)
              .map(([id]) => ({ settlementId: Number(id) })),
        },
      },
      {
        provide: GenerateLiquidationPdfService,
        useValue: { generateForSettlement },
      },
      {
        provide: APP_GUARD,
        inject: [Reflector],
        useFactory: (reflector: Reflector) => new JwtAuthGuard(reflector),
      },
    ],
  }).compile();

  const app = module.createNestApplication<NestExpressApplication>();
  app.set('trust proxy', 1);
  await app.init();
  return { app, generateForSettlement, queryBySlug };
}

describe('PublicSettlementQueryController', () => {
  describe('routes', () => {
    it('has no unscoped lookup: a municipality is always required', async () => {
      const { app } = await createApp();
      try {
        await request(app.getHttpServer())
          .post('/consulta-publica')
          .send(CRITERIA)
          .expect(404);
      } finally {
        await app.close();
      }
    });

    it('is reachable without a token and passes the slug to the lookup', async () => {
      const { app, queryBySlug } = await createApp();
      try {
        await request(app.getHttpServer())
          .post('/consulta-publica/paez')
          .send(CRITERIA)
          .expect(201, [{ settlementId: 1 }]);
        expect(queryBySlug).toHaveBeenCalledWith('paez', {
          cadastralCode: '001',
          ownerName: undefined,
          address: 'Main Street',
        });
      } finally {
        await app.close();
      }
    });

    it('answers an unknown slug like "no results" (201 with an empty list)', async () => {
      const { app } = await createApp();
      try {
        await request(app.getHttpServer())
          .post('/consulta-publica/no-existe')
          .send(CRITERIA)
          .expect(201, []);
      } finally {
        await app.close();
      }
    });

    it('GET /:slug gives only the municipality name, and 404 for an unknown slug', async () => {
      const { app } = await createApp();
      try {
        await request(app.getHttpServer())
          .get('/consulta-publica/paez')
          .expect(200, { slug: 'paez', name: 'Páez' });
        const unknown = await request(app.getHttpServer())
          .get('/consulta-publica/no-existe')
          .expect(404);
        expect(unknown.body.code ?? unknown.body.message?.code).toBe(
          'MUNICIPALITY_NOT_FOUND',
        );
      } finally {
        await app.close();
      }
    });
  });

  describe('POST /:slug/:id/liquidacion-pdf', () => {
    const pdfUrl = (slug: string, id: number) =>
      `/consulta-publica/${slug}/${id}/liquidacion-pdf`;

    it('generates the PDF of a settlement of that municipality, with that municipality id', async () => {
      const { app, generateForSettlement } = await createApp();
      try {
        const response = await request(app.getHttpServer())
          .post(pdfUrl('paez', 10))
          .send(CRITERIA)
          .expect(201)
          .expect('Content-Type', /application\/pdf/);
        expect(response.headers['content-disposition']).toContain('2026-0001');
        expect(generateForSettlement).toHaveBeenCalledWith(1, 10);
      } finally {
        await app.close();
      }
    });

    it("never generates another municipality's settlement: it looks like 'not found'", async () => {
      const { app, generateForSettlement } = await createApp();
      try {
        // 20 belongs to paez-cauca, asked through paez (and vice versa).
        await request(app.getHttpServer())
          .post(pdfUrl('paez', 20))
          .send(CRITERIA)
          .expect(404);
        await request(app.getHttpServer())
          .post(pdfUrl('paez-cauca', 10))
          .send(CRITERIA)
          .expect(404);
        expect(generateForSettlement).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });

    it('answers an unknown slug with the same 404 as a settlement that is not there', async () => {
      const { app, generateForSettlement } = await createApp();
      try {
        const unknownSlug = await request(app.getHttpServer())
          .post(pdfUrl('no-existe', 10))
          .send(CRITERIA)
          .expect(404);
        const unknownId = await request(app.getHttpServer())
          .post(pdfUrl('paez', 999))
          .send(CRITERIA)
          .expect(404);
        expect(unknownSlug.body.code).toBe(unknownId.body.code);
        expect(unknownSlug.body.code).toBe('SETTLEMENT_NOT_FOUND');
        expect(generateForSettlement).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    });
  });

  describe('rate limit', () => {
    async function exhaust(
      server: ReturnType<NestExpressApplication['getHttpServer']>,
      slug: string,
      ip: string,
    ) {
      for (let index = 0; index < PUBLIC_QUERY_LIMIT; index += 1) {
        await request(server)
          .post(`/consulta-publica/${slug}`)
          .set('X-Forwarded-For', ip)
          .send(CRITERIA)
          .expect(201);
      }
    }

    it('allows the limit, then rejects the next request with Retry-After', async () => {
      const { app } = await createApp();
      const server = app.getHttpServer();
      try {
        await exhaust(server, 'paez', '198.51.100.1');
        await request(server)
          .post('/consulta-publica/paez')
          .set('X-Forwarded-For', '198.51.100.1')
          .send(CRITERIA)
          .expect(429)
          .expect('Retry-After', /\d+/);
      } finally {
        await app.close();
      }
    });

    it('tracks forwarded client IPs separately', async () => {
      const { app } = await createApp();
      const server = app.getHttpServer();
      try {
        await exhaust(server, 'paez', '198.51.100.2');
        await request(server)
          .post('/consulta-publica/paez')
          .set('X-Forwarded-For', '203.0.113.8')
          .send(CRITERIA)
          .expect(201);
      } finally {
        await app.close();
      }
    });

    it("keeps one municipality's budget apart from another's, for the same client", async () => {
      const { app } = await createApp();
      const server = app.getHttpServer();
      try {
        await exhaust(server, 'paez', '198.51.100.3');
        await request(server)
          .post('/consulta-publica/paez')
          .set('X-Forwarded-For', '198.51.100.3')
          .send(CRITERIA)
          .expect(429);
        await request(server)
          .post('/consulta-publica/paez-cauca')
          .set('X-Forwarded-For', '198.51.100.3')
          .send(CRITERIA)
          .expect(201);
      } finally {
        await app.close();
      }
    });
  });
});
