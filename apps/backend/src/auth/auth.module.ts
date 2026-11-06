import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';
import { LoginAttemptTracker } from './login-attempt-tracker.js';
import { sessionPolicyFromEnv } from './session-policy.js';
import { SessionService } from './session.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET is not set. Copy apps/backend/.env.example to apps/backend/.env and fill it in.',
  );
}

@Module({
  imports: [
    PassportModule,
    // No default expiry: SessionService sets it on every token it signs.
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { algorithm: 'HS256' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    {
      provide: SessionService,
      inject: [PrismaService, JwtService],
      useFactory: (prisma: PrismaService, jwtService: JwtService) =>
        new SessionService(prisma, jwtService, sessionPolicyFromEnv()),
    },
    {
      provide: LoginAttemptTracker,
      useFactory: () => new LoginAttemptTracker(),
    },
  ],
})
export class AuthModule {}
