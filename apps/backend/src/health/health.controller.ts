import { Controller, Get, Logger, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const HEALTH_DB_TIMEOUT_MS = 2000;

export interface HealthBody {
  status: 'ok' | 'unavailable';
}

class DatabaseTimeoutError extends Error {}

// Public and outside any municipality: monitoring and the deployment pipeline
// call it without a token. The body is exactly { status } in both cases --
// versions, hosts, connection strings and error text stay out of it, and the
// reason for a failure only goes to the server log.
@Controller('health')
// Monitoring polls this route; it must never spend the budget of the public
// consultation limiter.
@SkipThrottle()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthBody> {
    try {
      await this.pingDatabase();
      return { status: 'ok' };
    } catch (error) {
      // Only the kind of failure: the driver's message can carry the host.
      this.logger.warn(
        error instanceof DatabaseTimeoutError
          ? `Database did not answer within ${HEALTH_DB_TIMEOUT_MS} ms.`
          : 'Database query failed.',
      );
      res.status(503);
      return { status: 'unavailable' };
    }
  }

  private async pingDatabase(): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new DatabaseTimeoutError()),
        HEALTH_DB_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([this.prisma.$queryRaw`SELECT 1`, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
