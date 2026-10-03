import 'dotenv/config';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { createObserveModule } from '@nestjs/observe';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
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
    // Per-IP rate limit for the public consultation. Only registered here
    // (storage + default options) -- the guard itself is applied just on
    // PublicSettlementQueryController, not globally, so the Administrator's
    // own endpoints (already behind JWT) are never limited.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
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
  ],
})
export class AppModule {}
