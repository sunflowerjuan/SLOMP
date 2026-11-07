import 'dotenv/config';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AssistantModule } from './assistant/assistant.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { MunicipalitiesModule } from './municipalities/municipalities.module.js';
import { PaymentOrdersModule } from './payment-orders/payment-orders.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SettlementsModule } from './settlements/settlements.module.js';
import { TaxRollModule } from './tax-roll/tax-roll.module.js';
import { TemplatesModule } from './templates/templates.module.js';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    MunicipalitiesModule,
    TaxRollModule,
    PaymentOrdersModule,
    SettlementsModule,
    TemplatesModule,
    AssistantModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Every route requires a valid JWT unless its handler (or controller)
    // is decorated with @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Every error response follows the same { statusCode, code, message }
    // shape; see common/errors.
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
