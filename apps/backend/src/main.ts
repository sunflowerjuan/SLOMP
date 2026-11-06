import { createRequire } from 'node:module';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule, ObserveInstrument } from './app.module.js';
import { allowedOrigins } from './auth/refresh-cookie.js';
import { assertDeploymentSecrets } from './common/deployment-secrets.js';
import { validationExceptionFactory } from './common/errors/error-body.js';
import { setupSecurityHeaders, setupSwagger } from './http-hardening.js';
import { setupRequestLogging } from './request-logging.js';
import { setupAssistantBodyLimit } from './assistant/assistant-body-limit.js';

// Plain require (not an import) so this doesn't need "resolveJsonModule" in
// tsconfig just to read one field off package.json.
const packageJson = createRequire(import.meta.url)('../package.json') as {
  version: string;
};

async function bootstrap() {
  // Before anything listens: outside a local machine, refuse secrets that are
  // published in the repository or too short (SL-115).
  assertDeploymentSecrets(process.env);

  const app = (await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  })) as NestExpressApplication;

  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS);
  if (Number.isInteger(trustProxyHops) && trustProxyHops >= 1) {
    // Behind Application Gateway, req.ip would otherwise be the gateway for every user.
    app.set('trust proxy', trustProxyHops);
  }

  setupSecurityHeaders(app);
  setupRequestLogging(app);
  setupAssistantBodyLimit(app);

  // whitelist strips any @Body() property with no class-validator decorator
  // on a real class-typed DTO (interfaces and primitive @Body('x') pulls are
  // untouched). LoginDto is the one existing DTO that needed decorators
  // added for this reason -- see login.dto.ts.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // The Administrator panel is served from a different origin (Vite in dev),
  // so the browser needs CORS to call the API. CORS_ORIGIN accepts a
  // comma-separated list of allowed origins.
  app.enableCors({
    origin: allowedOrigins(),
    // Lets the browser send and store the refresh token cookie when the
    // panel is on another origin.
    credentials: true,
    // Without this, the browser silently drops Content-Disposition from a
    // cross-origin response -- the frontend would never see the suggested
    // PDF file name and would always fall back to a generic one.
    exposedHeaders: ['Content-Disposition'],
  });

  setupSwagger(app, packageJson.version);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
