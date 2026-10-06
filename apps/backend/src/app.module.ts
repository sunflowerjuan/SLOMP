import 'dotenv/config';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';
import { JwtAuthGuard } from './auth/jwt-auth.guard.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { SettlementsModule } from './settlements/settlements.module.js';
import { TaxRollModule } from './tax-roll/tax-roll.module.js';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ObserveModule.forRoot({
      appKey: 'YOUR_APP_KEY',
      appSecret: 'YOUR_APP_SECRET',
      serviceId: 'backend',
    }),
    PrismaModule,
    AuthModule,
    TaxRollModule,
    SettlementsModule,
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
