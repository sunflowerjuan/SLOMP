import { Controller, Get } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  SWAGGER_PATH,
  isSwaggerEnabled,
  setupSecurityHeaders,
  setupSwagger,
} from './http-hardening.js';

@Controller()
class PingController {
  @Get('ping')
  ping() {
    return { ok: true };
  }
}

async function createApp(nodeEnv: string | undefined) {
  const module = await Test.createTestingModule({
    controllers: [PingController],
  }).compile();

  const app = module.createNestApplication<NestExpressApplication>();
  setupSecurityHeaders(app, nodeEnv);
  setupSwagger(app, '0.0.0-test', nodeEnv);
  await app.init();
  return app;
}

describe('isSwaggerEnabled', () => {
  it('is off only for a production build', () => {
    expect(isSwaggerEnabled('production')).toBe(false);
    expect(isSwaggerEnabled('development')).toBe(true);
    expect(isSwaggerEnabled('test')).toBe(true);
    expect(isSwaggerEnabled(undefined)).toBe(true);
  });
});

describe('HTTP hardening', () => {
  it('does not serve Swagger with NODE_ENV=production', async () => {
    const app = await createApp('production');
    const server = app.getHttpServer();

    try {
      await request(server).get(`/${SWAGGER_PATH}`).expect(404);
      await request(server).get(`/${SWAGGER_PATH}-json`).expect(404);
    } finally {
      await app.close();
    }
  });

  it('serves Swagger outside production', async () => {
    const app = await createApp('development');
    const server = app.getHttpServer();

    try {
      await request(server).get(`/${SWAGGER_PATH}`).expect(200);
      await request(server).get(`/${SWAGGER_PATH}-json`).expect(200);
    } finally {
      await app.close();
    }
  });

  it('sends the helmet security headers and hides X-Powered-By', async () => {
    const app = await createApp('production');

    try {
      const response = await request(app.getHttpServer())
        .get('/ping')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['x-powered-by']).toBeUndefined();
    } finally {
      await app.close();
    }
  });

  it('drops only the Content-Security-Policy where Swagger is served', async () => {
    const app = await createApp('development');

    try {
      const response = await request(app.getHttpServer())
        .get('/ping')
        .expect(200);

      expect(response.headers['content-security-policy']).toBeUndefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    } finally {
      await app.close();
    }
  });
});
