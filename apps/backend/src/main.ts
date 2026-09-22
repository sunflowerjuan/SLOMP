import { createRequire } from 'node:module';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule, ObserveInstrument } from './app.module.js';

// Plain require (not an import) so this doesn't need "resolveJsonModule" in
// tsconfig just to read one field off package.json.
const packageJson = createRequire(import.meta.url)('../package.json') as {
  version: string;
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });

  // The Administrator panel is served from a different origin (Vite in dev),
  // so the browser needs CORS to call the API. CORS_ORIGIN accepts a
  // comma-separated list of allowed origins.
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
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
