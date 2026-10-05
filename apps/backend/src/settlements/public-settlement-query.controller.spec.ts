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

async function createApp() {
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
        useValue: { query: async () => [] },
      },
      {
        provide: GenerateLiquidationPdfService,
        useValue: { generateForSettlement: async () => ({}) },
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
  return app;
}

describe('PublicSettlementQueryController rate limit', () => {
  it('allows the limit, then rejects the next request with Retry-After', async () => {
    const app = await createApp();
    const server = app.getHttpServer();

    try {
      for (let index = 0; index < PUBLIC_QUERY_LIMIT; index += 1) {
        await request(server)
          .post('/consulta-publica')
          .set('X-Forwarded-For', '198.51.100.1')
          .send({ cadastralCode: '001', address: 'Main Street' })
          .expect(201);
      }

      await request(server)
        .post('/consulta-publica')
        .set('X-Forwarded-For', '198.51.100.1')
        .send({ cadastralCode: '001', address: 'Main Street' })
        .expect(429)
        .expect('Retry-After', /\d+/);
    } finally {
      await app.close();
    }
  });

  it('tracks forwarded client IPs separately', async () => {
    const app = await createApp();
    const server = app.getHttpServer();

    try {
      for (let index = 0; index < PUBLIC_QUERY_LIMIT; index += 1) {
        await request(server)
          .post('/consulta-publica')
          .set('X-Forwarded-For', '198.51.100.2')
          .send({ cadastralCode: '001', address: 'Main Street' })
          .expect(201);
      }

      await request(server)
        .post('/consulta-publica')
        .set('X-Forwarded-For', '203.0.113.8')
        .send({ cadastralCode: '001', address: 'Main Street' })
        .expect(201);
    } finally {
      await app.close();
    }
  });
});
