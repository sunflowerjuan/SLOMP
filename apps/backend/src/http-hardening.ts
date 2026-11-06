import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

export const SWAGGER_PATH = 'api/docs';

// The API documentation lists every route and payload, so it is never served
// from a production build.
export function isSwaggerEnabled(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv !== 'production';
}

export function setupSecurityHeaders(
  app: NestExpressApplication,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  app.use(
    helmet({
      // Swagger UI relies on inline scripts and styles that helmet's default
      // Content-Security-Policy blocks, so the policy is only dropped where
      // Swagger is served.
      contentSecurityPolicy: !isSwaggerEnabled(nodeEnv),
    }),
  );
}

export function setupSwagger(
  app: NestExpressApplication,
  version: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): void {
  if (!isSwaggerEnabled(nodeEnv)) return;

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SLOMP API')
    .setDescription(
      'API del sistema de liquidaciones oficiales y mandamientos de pago de impuesto predial.',
    )
    .setVersion(version)
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(SWAGGER_PATH, app, swaggerDocument);
}
