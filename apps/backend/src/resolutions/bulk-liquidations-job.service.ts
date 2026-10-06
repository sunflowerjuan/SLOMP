import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ResolutionKind } from '@prisma/client';
import PizZip from 'pizzip';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir, availableParallelism } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  currentYearInColombia,
  PRESCRIPTION_YEARS,
} from '../tax-roll/period-rules.js';
import { selectGenerationTriggers } from './select-generation-triggers.js';
import { GenerateLiquidationPdfService } from './generate-liquidation-pdf.service.js';
import { convertDocxBatchToPdf } from '../liquidation-template/convert-docx-batch-to-pdf.js';
import { convertDocxToPdf } from '../liquidation-template/convert-docx-to-pdf.js';
import { CodedError } from '../common/errors/coded-error.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';

export const MAX_BULK_LIQUIDATIONS = 10_000;
export const BULK_BATCH_SIZE = 10;
export interface BulkJob {
  jobId: string;
  kind: ResolutionKind;
  status: 'running' | 'done' | 'failed';
  total: number;
  completed: number;
  startedAt: string;
  finishedAt: string | null;
  errorCode: string | null;
  errorDetails: object | null;
}
interface StoredJob {
  job: BulkJob;
  zip?: Buffer;
  expiry?: NodeJS.Timeout;
}

export function batchItems<T>(items: T[], size = BULK_BATCH_SIZE): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    batches.push(items.slice(i, i + size));
  return batches;
}

export function bulkWorkerCount(): number {
  const configured = Number(process.env.BULK_PDF_WORKERS);
  return Number.isInteger(configured) && configured >= 1
    ? configured
    : Math.max(1, Math.min(6, availableParallelism() - 1));
}

@Injectable()
export class BulkLiquidationsJobService {
  private readonly jobs = new Map<string, StoredJob>();
  private activeJobId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: GenerateLiquidationPdfService,
  ) {}

  // Everything the Administrator can download per type: pending settlements
  // (a new resolution is created for them) plus resolutions already generated
  // (re-rendered with the same number and no new consecutive), so a ZIP can be
  // downloaded as many times as needed.
  private async collectTriggers(): Promise<
    { id: number; kind: ResolutionKind }[]
  > {
    const pending = await this.prisma.settlement.findMany({
      where: { replacedAt: null, resolutionId: null },
      select: { id: true, propertyId: true, period: true },
    });
    const generated = await this.prisma.resolution.findMany({
      where: { settlements: { some: { replacedAt: null } } },
      select: {
        kind: true,
        settlements: {
          where: { replacedAt: null },
          select: { id: true },
          take: 1,
        },
      },
    });
    return [
      ...selectGenerationTriggers(pending, currentYearInColombia()),
      ...generated.map((resolution) => ({
        id: resolution.settlements[0]!.id,
        kind: resolution.kind,
      })),
    ];
  }

  async pendingCounts(): Promise<{ prescriptionRisk: number; normal: number }> {
    const triggers = await this.collectTriggers();
    return {
      prescriptionRisk: triggers.filter(
        (t) => t.kind === ResolutionKind.PRESCRIPTION_RISK,
      ).length,
      normal: triggers.filter((t) => t.kind === ResolutionKind.NORMAL).length,
    };
  }

  async start(kind: ResolutionKind): Promise<{ jobId: string }> {
    if (this.activeJobId)
      throw new ConflictException(
        errorBody(
          ErrorCode.BULK_GENERATION_IN_PROGRESS,
          'A bulk generation job is already running.',
        ),
      );
    const currentYear = currentYearInColombia();
    const triggers = (await this.collectTriggers()).filter(
      (t) => t.kind === kind,
    );
    if (this.activeJobId) {
      throw new ConflictException(
        errorBody(
          ErrorCode.BULK_GENERATION_IN_PROGRESS,
          'A bulk generation job is already running.',
        ),
      );
    }
    if (!triggers.length)
      throw new NotFoundException(
        errorBody(
          ErrorCode.NO_PENDING_LIQUIDATIONS,
          'No liquidations of this type to generate.',
        ),
      );
    if (triggers.length > MAX_BULK_LIQUIDATIONS)
      throw new BadRequestException(
        errorBody(
          ErrorCode.BULK_LIMIT_EXCEEDED,
          `There are ${triggers.length} pending liquidations, over the ${MAX_BULK_LIQUIDATIONS} limit.`,
          { count: triggers.length, max: MAX_BULK_LIQUIDATIONS },
        ),
      );
    const jobId = randomUUID();
    const job: BulkJob = {
      jobId,
      kind,
      status: 'running',
      total: triggers.length,
      completed: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      errorCode: null,
      errorDetails: null,
    };
    this.jobs.set(jobId, { job });
    this.activeJobId = jobId;
    void this.run(this.jobs.get(jobId)!, triggers, currentYear);
    return { jobId };
  }

  getActive(): BulkJob | null {
    return this.activeJobId
      ? (this.jobs.get(this.activeJobId)?.job ?? null)
      : null;
  }
  get(jobId: string): BulkJob {
    const stored = this.jobs.get(jobId);
    if (!stored)
      throw new NotFoundException(
        errorBody(
          ErrorCode.BULK_JOB_NOT_FOUND,
          'Bulk generation job not found.',
        ),
      );
    return { ...stored.job };
  }
  download(jobId: string): Buffer {
    const stored = this.jobs.get(jobId);
    if (!stored)
      throw new NotFoundException(
        errorBody(
          ErrorCode.BULK_JOB_NOT_FOUND,
          'Bulk generation job not found.',
        ),
      );
    if (stored.job.status !== 'done' || !stored.zip)
      throw new ConflictException(
        errorBody(
          ErrorCode.BULK_JOB_NOT_READY,
          'Bulk generation job is not ready for download.',
        ),
      );
    return stored.zip;
  }

  deleteDownloadedJob(jobId: string): void {
    this.deleteJob(jobId);
  }

  private async run(
    stored: StoredJob,
    triggers: { id: number; kind: ResolutionKind }[],
    currentYear: number,
  ): Promise<void> {
    const zip = new PizZip();
    const cutoff = currentYear - PRESCRIPTION_YEARS + 1;
    const queue = [...batchItems(triggers)];
    let stopped = false;
    const worker = async () => {
      const dir = await mkdtemp(join(tmpdir(), 'bulk-liquidations-'));
      try {
        // One LibreOffice profile per worker, reused across its batches: the
        // profile bootstrap is most of the cost of a single conversion.
        const profile = join(dir, 'profile');
        await mkdir(profile, { recursive: true });
        while (!stopped) {
          const batch = queue.shift();
          if (!batch) return;
          // Per-batch directory so .docx/.pdf files never pile up until the
          // whole job ends.
          const batchDir = await mkdtemp(join(dir, 'batch-'));
          try {
            const prepared = [];
            for (const trigger of batch)
              prepared.push({
                trigger,
                item: await this.pdfService.prepareLiquidationDocx(trigger.id),
              });
            const docs = prepared.map(({ item }) => ({
              name: randomUUID(),
              docx: item.docx,
            }));
            const converted = await convertDocxBatchToPdf(
              docs,
              batchDir,
              profile,
            );
            for (let i = 0; i < prepared.length; i++) {
              const { trigger, item } = prepared[i]!;
              // A document the batch could not convert is retried alone.
              const pdf =
                converted.get(docs[i]!.name)?.pdf ??
                (await convertDocxToPdf(item.docx));
              const folder =
                trigger.kind === ResolutionKind.PRESCRIPTION_RISK
                  ? `Liquidaciones antes de ${cutoff}`
                  : `Liquidaciones ${cutoff} en adelante`;
              zip.file(`${folder}/${item.resolutionNumber}.pdf`, pdf);
              stored.job.completed++;
            }
          } catch (error) {
            stopped = true;
            throw error;
          } finally {
            await rm(batchDir, { recursive: true, force: true });
          }
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    };
    try {
      const outcomes = await Promise.allSettled(
        Array.from({ length: Math.min(bulkWorkerCount(), queue.length) }, () =>
          worker(),
        ),
      );
      const failure = outcomes.find((outcome) => outcome.status === 'rejected');
      if (failure?.status === 'rejected') throw failure.reason;
      stored.zip = zip.generate({ type: 'nodebuffer' });
      stored.job.status = 'done';
    } catch (error) {
      // Reservations made before a batch failure stay consumed; the already-generated branch can regenerate those resolutions one by one.
      stored.job.status = 'failed';
      stored.job.errorCode =
        error instanceof CodedError ? error.code : ErrorCode.INTERNAL_ERROR;
      stored.job.errorDetails =
        error instanceof CodedError ? (error.details ?? null) : null;
    } finally {
      stored.job.finishedAt = new Date().toISOString();
      this.activeJobId = null;
      stored.expiry = setTimeout(
        () => this.deleteJob(stored.job.jobId),
        15 * 60_000,
      );
      stored.expiry.unref();
    }
  }

  private deleteJob(jobId: string): void {
    const stored = this.jobs.get(jobId);
    if (stored?.expiry) clearTimeout(stored.expiry);
    this.jobs.delete(jobId);
  }
}
