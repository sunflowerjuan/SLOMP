import { createRequire } from 'node:module';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';

// Plain require (not an import) so this doesn't need "resolveJsonModule" in
// tsconfig just to read one field off package.json.
const packageJson = createRequire(import.meta.url)('../package.json') as {
  version: string;
};

async function bootstrap() {
  const app = (await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  })) as NestExpressApplication;

  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS);
  if (Number.isInteger(trustProxyHops) && trustProxyHops >= 1) {
    // Behind Application Gateway, req.ip would otherwise be the gateway for every user.
    app.set('trust proxy', trustProxyHops);
  }

  // whitelist strips any @Body() property with no class-validator decorator
  // on a real class-typed DTO (interfaces and primitive @Body('x') pulls are
  // untouched). LoginDto is the one existing DTO that needed decorators
  // added for this reason -- see login.dto.ts.
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // The Administrator panel is served from a different origin (Vite in dev),
  // so the browser needs CORS to call the API. CORS_ORIGIN accepts a
  // comma-separated list of allowed origins.
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
    // Without this, the browser silently drops Content-Disposition from a
    // cross-origin response -- the frontend would never see the suggested
    // PDF file name and would always fall back to a generic one.
    exposedHeaders: ['Content-Disposition'],
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SLOMP API')
    .setDescription(
      'API del sistema de liquidaciones oficiales y mandamientos de pago de impuesto predial.',
    )
    .setVersion(packageJson.version)
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
