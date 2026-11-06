import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { SettlementStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { enFirmeCutoff } from './settlement-status-rules.js';

// ponytail: hourly sweep, so a liquidation can show VIGENTE for up to an hour
// past its 60th day; switch to an external scheduler (or evaluate on read)
// if it ever has to flip to the minute.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

// Moves VIGENTE liquidations to EN_FIRME once 60 days have passed since their
// resolution was issued. The state is stored (not computed on read) so every
// query, the public consultation and reporting see the same value. One
// idempotent UPDATE: safe if several backend instances run it at once.
@Injectable()
export class EnFirmeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EnFirmeService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async markEnFirme(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.settlement.updateMany({
      where: {
        status: SettlementStatus.VIGENTE,
        replacedAt: null,
        resolution: { is: { issuedAt: { lte: enFirmeCutoff(now) } } },
      },
      data: { status: SettlementStatus.EN_FIRME },
    });
    return count;
  }

  private async sweep(): Promise<void> {
    try {
      const count = await this.markEnFirme();
      if (count > 0) this.logger.log(`${count} liquidations moved to EN_FIRME`);
    } catch (error) {
      // A failed sweep is retried on the next tick; never crash the backend.
      this.logger.error(`EN_FIRME sweep failed: ${(error as Error).message}`);
    }
  }
}
