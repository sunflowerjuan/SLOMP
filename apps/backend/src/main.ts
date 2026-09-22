import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';

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
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
