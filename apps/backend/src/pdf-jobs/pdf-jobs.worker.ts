import { setTimeout as sleep } from 'node:timers/promises';
import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { parsePdfResult } from './pdf-job-rules.js';
import { PdfJobsService } from './pdf-jobs.service.js';
import { PdfServiceClient } from './pdf-service.client.js';

const POLL_INTERVAL_MS = 2_000;
const SWEEP_INTERVAL_MS = 5 * 60_000;

// Background side of the bulk jobs: consumes pdf-results and runs the
// sweeper (expired ZIPs, watchdog). Off when Storage isn't configured.
@Injectable()
export class PdfJobsWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PdfJobsWorker.name);
  private running = false;
  private loop: Promise<void> | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly jobs: PdfJobsService,
    private readonly pdf: PdfServiceClient,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.pdf.storageConfigured) return;
    this.running = true;
    this.loop = this.consume();
    void this.jobs
      .recoverInterrupted()
      .catch((error: Error) =>
        this.logger.error(`recovering jobs failed: ${error.message}`),
      )
      .then(() => this.sweep());
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    clearInterval(this.timer);
    await this.loop;
  }

  private async sweep(): Promise<void> {
    try {
      await this.jobs.sweep();
    } catch (error) {
      // Retried on the next tick; never crash the backend.
      this.logger.error(`sweep failed: ${(error as Error).message}`);
    }
  }

  private async consume(): Promise<void> {
    const storage = this.pdf.storage();
    let ready = false;
    while (this.running) {
      try {
        if (!ready) {
          await storage.ensureCreated();
          ready = true;
        }
        const messages = await storage.receiveResults(16);
        if (messages.length === 0) {
          await sleep(POLL_INTERVAL_MS);
          continue;
        }
        for (const message of messages) {
          const result = parsePdfResult(message.text);
          if (result) {
            await this.jobs.applyResult(result);
          } else {
            this.logger.warn(`dropping malformed pdf-results message`);
          }
          await message.delete();
        }
      } catch (error) {
        // A message not deleted comes back after its visibility timeout.
        this.logger.error(`pdf-results: ${(error as Error).message}`);
        await sleep(POLL_INTERVAL_MS);
      }
    }
  }
}
