import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  GoneException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  PdfBatchStatus,
  PdfDocumentType,
  PdfJobStatus,
  Prisma,
  ResolutionKind,
  type PdfJob,
} from '@prisma/client';
import type {
  BatchInput,
  PdfResult,
  RenderBatchMessage,
  AssembleZipMessage,
  TemplateRef,
} from 'shared/pdf-contract';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import {
  buildLiquidationTemplateData,
  missingLiquidationData,
  toTemplateSettlements,
  type PropertyLike,
  type SettlementWithDetailsLike,
} from '../liquidation-template/build-liquidation-template-data.js';
import {
  buildPaymentOrderTemplateData,
  missingPaymentOrderData,
  templateSettlementsOf,
} from '../payment-orders/build-payment-order-template-data.js';
import { issuePaymentOrders } from '../payment-orders/issue-payment-orders.js';
import {
  evaluatePaymentOrderEligibility,
  groupSettlementsByProperty,
  type PaymentOrderGroup,
} from '../payment-orders/payment-order-rules.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { formatResolutionNumber } from '../resolutions/reserve-resolution-number.js';
import { selectGenerationTriggers } from '../resolutions/select-generation-triggers.js';
import {
  currentYearInColombia,
  isPrescriptionRisk,
} from '../tax-roll/period-rules.js';
import { lockCounter } from './counter-lock.js';
import {
  ACTIVE_JOB_STATUSES,
  BATCH_PHASE_STATUSES,
  bulkFolder,
  bulkZipFileName,
  counterAfterRevert,
  minutesAfter,
  minutesBefore,
  paymentOrderFileName,
  splitIntoBatches,
} from './pdf-job-rules.js';
import { PdfServiceClient } from './pdf-service.client.js';

// What a bulk job keeps in memory about each document while it plans, checks
// and enqueues: ids only. The heavy data (details, owners) is read a chunk at
// a time, so memory depends on the chunk and not on the size of the job.
interface PlannedDocument {
  /** Pending group: the settlements the new resolution covers. */
  propertyId?: number;
  settlementIds?: number[];
  /** Issued before: its id, rendered again under the same number. */
  resolutionId?: number;
  /** Set by reserve() for a pending group; the existing one otherwise. */
  resolutionNumber?: string;
}

// A planned document with the data its template needs.
interface BulkDocument {
  property: PropertyLike;
  settlements: SettlementWithDetailsLike[];
  resolutionNumber?: string;
}

// One file of a bulk job: where it goes in the ZIP and what its template gets.
interface BulkFile {
  fileName: string;
  data: Record<string, unknown>;
}

// Blobs uploaded / messages sent at once while enqueuing a job. A chunk is
// this many batches, so the data in memory is at most that many batches.
const DISPATCH_PARALLELISM = 16;
// Only what the templates use: no timestamps, ids or other columns.
const SETTLEMENT_DATA = {
  period: true,
  details: { select: { concept: true, amount: true } },
} as const;
const PROPERTY_DATA = {
  select: {
    cadastralCode: true,
    address: true,
    owners: { select: { owner: { select: { name: true } } } },
  },
} as const;
// Ids per query of a plan, well under PostgreSQL's limit on bind parameters.
const IDS_PER_QUERY = 5000;

function jobNotFound(): NotFoundException {
  return new NotFoundException(
    errorBody(ErrorCode.BULK_JOB_NOT_FOUND, 'Bulk generation job not found.'),
  );
}

function inProgress(): ConflictException {
  return new ConflictException(
    errorBody(
      ErrorCode.BULK_GENERATION_IN_PROGRESS,
      'A bulk generation job is already running for this municipality.',
    ),
  );
}

export function jobView(job: PdfJob) {
  return {
    jobId: job.id,
    documentType: job.documentType,
    kind: job.kind,
    status: job.status,
    totalDocuments: job.totalDocuments,
    completedDocuments: job.completedDocuments,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    expiresAt: job.expiresAt,
    errorCode: job.errorCode,
    errorDetails: job.errorDetails,
  };
}

// The backend coordinates bulk generation; the PDF service renders it
// (Confluence "Servicio de PDF: contrato entre backend y worker (SL-118)").
// State lives in pdf_jobs, so a job survives restarts of either side.
@Injectable()
export class PdfJobsService {
  private readonly logger = new Logger(PdfJobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfServiceClient,
  ) {}

  private jobsPath(jobId: string, rest = ''): string {
    return `${this.pdf.config.jobsContainer}/${jobId}/${rest}`;
  }

  // Liquidations the Administrator can download per kind: pending groups
  // (a new resolution each) plus resolutions issued before (rendered again).
  async pending(municipalityId: number, documentType: PdfDocumentType) {
    const pending = await this.prisma.settlement.findMany({
      where: {
        replacedAt: null,
        resolutionId: null,
        property: { municipalityId },
      },
      select: { id: true, propertyId: true, period: true },
    });
    const issued = await this.prisma.resolution.groupBy({
      by: ['kind'],
      where: { municipalityId, settlements: { some: { replacedAt: null } } },
      _count: true,
    });
    const triggers = selectGenerationTriggers(pending, currentYearInColombia());
    const count = (kind: ResolutionKind) =>
      triggers.filter((t) => t.kind === kind).length +
      (issued.find((group) => group.kind === kind)?._count ?? 0);
    return {
      documentType,
      prescriptionRisk: count(ResolutionKind.PRESCRIPTION_RISK),
      normal: count(ResolutionKind.NORMAL),
    };
  }

  // The documents of a job as ids only: one per property with pending
  // periods of the kind (a new resolution each) and one per resolution of the
  // kind issued before (rendered again).
  private async plan(
    municipalityId: number,
    kind: ResolutionKind,
    currentYear: number,
  ): Promise<PlannedDocument[]> {
    // ponytail: the kind is decided here and not in the query so the rule
    // lives only in isPrescriptionRisk; the rows are three integers each.
    const pending = await this.prisma.settlement.findMany({
      where: {
        replacedAt: null,
        resolutionId: null,
        property: { municipalityId },
      },
      select: { id: true, propertyId: true, period: true },
      orderBy: [{ propertyId: 'asc' }, { period: 'asc' }],
    });
    const groups = new Map<number, number[]>();
    for (const settlement of pending) {
      const settlementKind = isPrescriptionRisk(settlement.period, currentYear)
        ? ResolutionKind.PRESCRIPTION_RISK
        : ResolutionKind.NORMAL;
      if (settlementKind !== kind) continue;
      groups.set(settlement.propertyId, [
        ...(groups.get(settlement.propertyId) ?? []),
        settlement.id,
      ]);
    }

    const issued = await this.prisma.resolution.findMany({
      where: {
        municipalityId,
        kind,
        settlements: { some: { replacedAt: null } },
      },
      select: { id: true, number: true },
      orderBy: [{ year: 'asc' }, { sequence: 'asc' }],
    });

    return [
      ...[...groups].map(([propertyId, settlementIds]) => ({
        propertyId,
        settlementIds,
      })),
      ...issued.map((resolution) => ({
        resolutionId: resolution.id,
        resolutionNumber: resolution.number,
      })),
    ];
  }

  // Reads the data of a chunk of planned documents, in the same order.
  private async load(
    municipalityId: number,
    chunk: PlannedDocument[],
  ): Promise<BulkDocument[]> {
    const settlementIds = chunk.flatMap((entry) => entry.settlementIds ?? []);
    const resolutionIds = chunk.flatMap((entry) =>
      entry.resolutionId === undefined ? [] : [entry.resolutionId],
    );
    const settlements =
      settlementIds.length === 0
        ? []
        : await this.prisma.settlement.findMany({
            where: {
              id: { in: settlementIds },
              property: { municipalityId },
            },
            select: { id: true, property: PROPERTY_DATA, ...SETTLEMENT_DATA },
            orderBy: { period: 'asc' },
          });
    const resolutions =
      resolutionIds.length === 0
        ? []
        : await this.prisma.resolution.findMany({
            where: { id: { in: resolutionIds }, municipalityId },
            select: {
              id: true,
              property: PROPERTY_DATA,
              settlements: {
                select: SETTLEMENT_DATA,
                orderBy: { period: 'asc' },
              },
            },
          });
    const settlementById = new Map(settlements.map((s) => [s.id, s]));
    const resolutionById = new Map(resolutions.map((r) => [r.id, r]));

    return chunk.map((entry) => {
      if (entry.settlementIds) {
        const members = entry.settlementIds.map((id) =>
          settlementById.get(id)!,
        );
        return {
          property: members[0]!.property,
          settlements: toTemplateSettlements(members),
          resolutionNumber: entry.resolutionNumber,
        };
      }
      const resolution = resolutionById.get(entry.resolutionId!)!;
      return {
        property: resolution.property,
        settlements: toTemplateSettlements(resolution.settlements),
        resolutionNumber: entry.resolutionNumber,
      };
    });
  }

  // Documents per chunk: whole batches, so a chunk's batch indexes follow the
  // previous chunk's.
  private get chunkSize(): number {
    return DISPATCH_PARALLELISM * this.pdf.config.batchSize;
  }

  async create(
    municipalityId: number,
    administratorId: number | null,
    kind: ResolutionKind,
  ) {
    this.pdf.storage(); // 503 before any work when Storage isn't configured
    const template = await this.pdf.liquidationTemplate(municipalityId);
    const { maxBulkDocuments } = this.pdf.config;
    const year = currentYearInColombia();

    if (await this.activeJob(municipalityId)) throw inProgress();
    const documents = await this.plan(municipalityId, kind, year);
    if (documents.length === 0) {
      throw new NotFoundException(
        errorBody(
          ErrorCode.NO_PENDING_LIQUIDATIONS,
          'No liquidations of this type to generate.',
        ),
      );
    }
    if (documents.length > maxBulkDocuments) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.BULK_LIMIT_EXCEEDED,
          `There are ${documents.length} liquidations to generate, over the ${maxBulkDocuments} limit.`,
          { count: documents.length, max: maxBulkDocuments },
        ),
      );
    }
    // All or nothing: every document is checked before anything is reserved,
    // a chunk at a time.
    const incomplete: Record<string, unknown>[] = [];
    for (const chunk of splitIntoBatches(documents, this.chunkSize)) {
      for (const document of await this.load(municipalityId, chunk)) {
        const missing = missingLiquidationData(
          document.property,
          document.settlements,
        );
        if (missing.length > 0) {
          incomplete.push({
            cadastralCode: document.property.cadastralCode,
            periods: document.settlements.map((s) => s.period),
            missing,
          });
        }
      }
    }
    if (incomplete.length > 0) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.LIQUIDATION_DATA_INCOMPLETE,
          `${incomplete.length} liquidations are missing required data. Complete them and try again.`,
          { documents: incomplete },
        ),
      );
    }

    const job = await this.reserve(
      municipalityId,
      administratorId,
      kind,
      year,
      template,
      documents,
    );
    const folder = bulkFolder(kind, year);
    try {
      await this.dispatch(job, template, documents, async (chunk) =>
        (await this.load(municipalityId, chunk)).map((document) => ({
          fileName: `${folder}/${document.resolutionNumber}.pdf`,
          data: buildLiquidationTemplateData(
            document.resolutionNumber!,
            document.property,
            document.settlements,
          ) as unknown as Record<string, unknown>,
        })),
      );
    } catch (error) {
      this.logger.error(
        `job ${job.id}: enqueuing failed: ${(error as Error).message}`,
      );
      await this.revert(job.id, ErrorCode.PDF_STORAGE_UNAVAILABLE);
      throw new ServiceUnavailableException(
        errorBody(
          ErrorCode.PDF_STORAGE_UNAVAILABLE,
          'Could not enqueue the bulk generation job. Try again later.',
        ),
        { cause: error },
      );
    }
    return {
      jobId: job.id,
      status: PdfJobStatus.RUNNING,
      totalDocuments: job.totalDocuments,
    };
  }

  // One transaction under the counter lock: insert the job (the partial
  // unique index refuses a second active one), reserve the whole range and
  // issue the new resolutions linked to the job.
  private reserve(
    municipalityId: number,
    administratorId: number | null,
    kind: ResolutionKind,
    year: number,
    template: TemplateRef,
    documents: PlannedDocument[],
  ): Promise<PdfJob> {
    const pending = documents.filter((d) => d.settlementIds);
    return this.prisma.$transaction(
      async (tx) => {
        const counter = await lockCounter(tx, municipalityId, year);
        const firstSequence = pending.length > 0 ? counter + 1 : null;
        const lastSequence =
          pending.length > 0 ? counter + pending.length : null;
        let job: PdfJob;
        try {
          job = await tx.pdfJob.create({
            data: {
              municipalityId,
              createdById: administratorId,
              documentType: PdfDocumentType.LIQUIDACION,
              kind,
              totalDocuments: documents.length,
              templateBlob: template.blob,
              templateSha256: template.sha256,
              year,
              firstSequence,
              lastSequence,
            },
          });
        } catch (error) {
          if ((error as { code?: unknown }).code === 'P2002') {
            throw inProgress();
          }
          throw error;
        }
        if (pending.length === 0) return job;

        await tx.resolutionCounter.update({
          where: { municipalityId_year: { municipalityId, year } },
          data: { lastSequence: lastSequence! },
        });
        pending.forEach((document, i) => {
          document.resolutionNumber = formatResolutionNumber(
            year,
            firstSequence! + i,
          );
        });
        const resolutions = await tx.resolution.createManyAndReturn({
          data: pending.map((document, i) => ({
            number: document.resolutionNumber!,
            year,
            sequence: firstSequence! + i,
            kind,
            propertyId: document.propertyId!,
            municipalityId,
            pdfJobId: job.id,
          })),
          select: { id: true, number: true },
        });
        const idByNumber = new Map(resolutions.map((r) => [r.number, r.id]));
        const settlementIds = pending.flatMap((d) => d.settlementIds!);
        const resolutionIds = pending.flatMap((d) =>
          d.settlementIds!.map(() => idByNumber.get(d.resolutionNumber!)!),
        );
        // One statement for the whole job; the resolutionId/replacedAt guard
        // catches a settlement another request claimed or replaced meanwhile.
        const linked = await tx.$executeRaw`
          UPDATE "settlements" AS s SET "resolutionId" = m.rid
          FROM unnest(${settlementIds}::int[], ${resolutionIds}::int[]) AS m(sid, rid)
          WHERE s."id" = m.sid AND s."resolutionId" IS NULL AND s."replacedAt" IS NULL`;
        if (linked !== settlementIds.length) {
          throw new ConflictException(
            errorBody(
              ErrorCode.LIQUIDATION_CONCURRENT_GENERATION,
              'Some liquidations changed while the job was being created. Try again.',
            ),
          );
        }
        return job;
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  // Writes input/batch-NNN.json, one batch row and one render-batch message
  // per batch, then marks the job RUNNING. The data of the documents is read
  // and written a chunk at a time (`toFiles` turns a chunk of the plan into its
  // files), so at most one chunk is in memory.
  private async dispatch<T>(
    job: PdfJob,
    template: TemplateRef,
    plan: T[],
    toFiles: (chunk: T[]) => Promise<BulkFile[]>,
  ): Promise<void> {
    const storage = this.pdf.storage();
    const { batchSize } = this.pdf.config;
    const totalBatches = Math.ceil(plan.length / batchSize);
    await this.prisma.pdfJobBatch.createMany({
      data: Array.from({ length: totalBatches }, (_, batchIndex) => ({
        jobId: job.id,
        batchIndex,
        documentCount: Math.min(
          batchSize,
          plan.length - batchIndex * batchSize,
        ),
      })),
    });
    await this.prisma.pdfJob.update({
      where: { id: job.id },
      data: { totalBatches, startedAt: new Date() },
    });
    const chunks = splitIntoBatches(plan, this.chunkSize);
    for (const [chunkIndex, chunk] of chunks.entries()) {
      const batches = splitIntoBatches(await toFiles(chunk), batchSize);
      await Promise.all(
        batches.map(async (batch, j) => {
          const batchIndex = chunkIndex * DISPATCH_PARALLELISM + j;
          const inputBlob = this.jobsPath(
            job.id,
            `input/batch-${String(batchIndex).padStart(3, '0')}.json`,
          );
          const input: BatchInput = { documents: batch };
          await storage.upload(
            inputBlob,
            Buffer.from(JSON.stringify(input)),
            'application/json',
          );
          const message: RenderBatchMessage = {
            schemaVersion: 1,
            type: 'render-batch',
            jobId: job.id,
            municipalityId: job.municipalityId,
            documentType: job.documentType,
            batchIndex,
            inputBlob,
            template,
            outputPrefix: this.jobsPath(job.id, 'pdf/'),
          };
          await storage.sendWork(JSON.stringify(message));
        }),
      );
    }
    // The last batch may already be done (ASSEMBLING): only PREPARING moves.
    await this.prisma.pdfJob.updateMany({
      where: { id: job.id, status: PdfJobStatus.PREPARING },
      data: { status: PdfJobStatus.RUNNING },
    });
  }

  // Payment orders of a bulk job: one per property with the listed
  // settlements (the "eligible" ones of the Excel preview). The numbers come
  // from the payment order counter, with the same rules as liquidations: held
  // under its lock and handed back by revert() if the job fails. The listed
  // settlements are checked again here, all or nothing.
  async createPaymentOrders(
    municipalityId: number,
    administratorId: number | null,
    settlementIds: number[],
    now = new Date(),
  ) {
    this.pdf.storage(); // 503 before any work when Storage isn't configured
    const template = await this.pdf.activeTemplate(
      municipalityId,
      PdfDocumentType.MANDAMIENTO,
    );
    const year = currentYearInColombia(now);

    if (await this.activeJob(municipalityId)) throw inProgress();
    const ids = [...new Set(settlementIds)].sort((a, b) => a - b);
    // Only what the eligibility rules read; the data of the documents is read
    // later, a chunk at a time.
    const found = (
      await Promise.all(
        splitIntoBatches(ids, IDS_PER_QUERY).map((idsChunk) =>
          this.prisma.settlement.findMany({
            where: { id: { in: idsChunk }, property: { municipalityId } },
            select: {
              id: true,
              propertyId: true,
              status: true,
              replacedAt: true,
              resolution: { select: { issuedAt: true } },
              paymentOrder: { select: { id: true } },
            },
          }),
        ),
      )
    ).flat();
    const byId = new Map(
      found.map((settlement) => [settlement.id, settlement]),
    );
    const ineligible = ids.flatMap((id) => {
      const settlement = byId.get(id);
      if (!settlement) {
        return [{ settlementId: id, reason: 'SETTLEMENT_NOT_FOUND' }];
      }
      const result = evaluatePaymentOrderEligibility(
        {
          status: settlement.status,
          replacedAt: settlement.replacedAt,
          resolutionIssuedAt: settlement.resolution?.issuedAt ?? null,
          hasPaymentOrder: settlement.paymentOrder !== null,
        },
        now,
      );
      return result.eligible
        ? []
        : [
            {
              settlementId: id,
              reason: result.reason,
              ...(result.firmOn && { firmOn: result.firmOn }),
            },
          ];
    });
    if (ineligible.length > 0) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.PAYMENT_ORDER_INELIGIBLE,
          `${ineligible.length} settlements cannot get a payment order now. Reload the Excel and try again.`,
          { settlements: ineligible },
        ),
      );
    }

    const groups = groupSettlementsByProperty(found);
    const { maxBulkDocuments } = this.pdf.config;
    if (groups.length > maxBulkDocuments) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.BULK_LIMIT_EXCEEDED,
          `There are ${groups.length} payment orders to generate, over the ${maxBulkDocuments} limit.`,
          { count: groups.length, max: maxBulkDocuments },
        ),
      );
    }
    // All or nothing: every document is checked before anything is reserved,
    // a chunk at a time.
    const incomplete: Record<string, unknown>[] = [];
    for (const chunk of splitIntoBatches(groups, this.chunkSize)) {
      for (const document of await this.loadPaymentOrders(
        municipalityId,
        chunk,
      )) {
        const missing = missingPaymentOrderData(
          document.property,
          document.settlements,
        );
        if (missing.length > 0) {
          incomplete.push({
            cadastralCode: document.property.cadastralCode,
            periods: document.settlements.map((s) => s.period),
            missing,
          });
        }
      }
    }
    if (incomplete.length > 0) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.LIQUIDATION_DATA_INCOMPLETE,
          `${incomplete.length} payment orders are missing required data. Complete them and try again.`,
          { documents: incomplete },
        ),
      );
    }

    const { job, issued } = await this.reservePaymentOrders(
      municipalityId,
      administratorId,
      year,
      now,
      template,
      groups,
    );
    try {
      await this.dispatch(
        job,
        template,
        groups.map((group, i) => ({ group, order: issued[i]! })),
        async (chunk) => {
          const documents = await this.loadPaymentOrders(
            municipalityId,
            chunk.map((entry) => entry.group),
          );
          return documents.map((document, i) => ({
            fileName: paymentOrderFileName(chunk[i]!.order.number),
            data: buildPaymentOrderTemplateData(
              chunk[i]!.order.number,
              chunk[i]!.order.issuedAt,
              document.property,
              document.settlements,
            ) as unknown as Record<string, unknown>,
          }));
        },
      );
    } catch (error) {
      this.logger.error(
        `job ${job.id}: enqueuing failed: ${(error as Error).message}`,
      );
      await this.revert(job.id, ErrorCode.PDF_STORAGE_UNAVAILABLE);
      throw new ServiceUnavailableException(
        errorBody(
          ErrorCode.PDF_STORAGE_UNAVAILABLE,
          'Could not enqueue the bulk generation job. Try again later.',
        ),
        { cause: error },
      );
    }
    return {
      jobId: job.id,
      status: PdfJobStatus.RUNNING,
      totalDocuments: job.totalDocuments,
    };
  }

  // The data of a chunk of payment order groups, in the same order.
  private async loadPaymentOrders(
    municipalityId: number,
    groups: PaymentOrderGroup[],
  ) {
    const settlements = await this.prisma.settlement.findMany({
      where: {
        id: { in: groups.flatMap((group) => group.settlementIds) },
        property: { municipalityId },
      },
      select: {
        id: true,
        property: PROPERTY_DATA,
        resolution: { select: { number: true } },
        ...SETTLEMENT_DATA,
      },
    });
    const byId = new Map(settlements.map((s) => [s.id, s]));
    return groups.map((group) => {
      const members = group.settlementIds.map((id) => byId.get(id)!);
      return {
        property: members[0]!.property,
        settlements: templateSettlementsOf(members),
      };
    });
  }

  // One transaction under the payment order counter lock: insert the job (the
  // partial unique index refuses a second active one), reserve the range and
  // issue the payment orders linked to the job.
  private reservePaymentOrders(
    municipalityId: number,
    administratorId: number | null,
    year: number,
    now: Date,
    template: TemplateRef,
    groups: PaymentOrderGroup[],
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const counter = await lockCounter(
          tx,
          municipalityId,
          year,
          'paymentOrder',
        );
        let job: PdfJob;
        try {
          job = await tx.pdfJob.create({
            data: {
              municipalityId,
              createdById: administratorId,
              documentType: PdfDocumentType.MANDAMIENTO,
              totalDocuments: groups.length,
              templateBlob: template.blob,
              templateSha256: template.sha256,
              year,
              firstSequence: counter + 1,
              lastSequence: counter + groups.length,
            },
          });
        } catch (error) {
          if ((error as { code?: unknown }).code === 'P2002') {
            throw inProgress();
          }
          throw error;
        }
        const issued = await issuePaymentOrders(tx, {
          municipalityId,
          administratorId,
          year,
          now,
          groups,
          pdfJobId: job.id,
        });
        return { job, issued };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
  }

  activeJob(municipalityId: number): Promise<PdfJob | null> {
    return this.prisma.pdfJob.findFirst({
      where: { municipalityId, status: { in: ACTIVE_JOB_STATUSES } },
    });
  }

  // A job of another municipality is "not found", same as one that doesn't
  // exist.
  async get(municipalityId: number, jobId: string): Promise<PdfJob> {
    const job = await this.prisma.pdfJob.findFirst({
      where: { id: jobId, municipalityId },
    });
    if (!job) throw jobNotFound();
    return job;
  }

  async download(
    municipalityId: number,
    jobId: string,
    now = new Date(),
  ): Promise<{ stream: Readable; fileName: string }> {
    const job = await this.get(municipalityId, jobId);
    const expired = new GoneException(
      errorBody(
        ErrorCode.BULK_JOB_EXPIRED,
        'The ZIP of this job expired. Generate it again.',
      ),
    );
    if (
      job.status === PdfJobStatus.EXPIRED ||
      (job.status === PdfJobStatus.DONE &&
        job.expiresAt !== null &&
        job.expiresAt <= now)
    ) {
      throw expired;
    }
    if (job.status !== PdfJobStatus.DONE) {
      throw new ConflictException(
        errorBody(
          ErrorCode.BULK_JOB_NOT_READY,
          'Bulk generation job is not ready for download.',
        ),
      );
    }
    const stream = await this.pdf
      .storage()
      .openRead(this.jobsPath(job.id, 'result.zip'));
    if (!stream) throw expired;
    return { stream, fileName: bulkZipFileName(job.documentType, job.kind) };
  }

  // Applies one pdf-results message. Idempotent: a repeated or late result
  // changes nothing. The job row is locked so concurrent results of the same
  // job can't both miss "this was the last batch".
  async applyResult(result: PdfResult, now = new Date()): Promise<void> {
    if (result.status === 'FAILED') {
      const phases =
        result.type === 'batch-result'
          ? BATCH_PHASE_STATUSES
          : [PdfJobStatus.ASSEMBLING];
      await this.revert(
        result.jobId,
        result.errorCode,
        {
          ...result.errorDetails,
          ...(result.type === 'batch-result' && {
            batchIndex: result.batchIndex,
          }),
        },
        phases,
      );
      return;
    }

    if (result.type === 'zip-result') {
      const { count } = await this.prisma.pdfJob.updateMany({
        where: { id: result.jobId, status: PdfJobStatus.ASSEMBLING },
        data: {
          status: PdfJobStatus.DONE,
          finishedAt: now,
          expiresAt: minutesAfter(now, this.pdf.config.zipTtlMinutes),
        },
      });
      if (count === 0) return;
      await this.prisma.pdfJobBatch.deleteMany({
        where: { jobId: result.jobId },
      });
      // Only the ZIP stays; a failed cleanup is caught by the container's
      // lifecycle rule.
      await this.deleteBlobs(this.jobsPath(result.jobId, 'input/'));
      await this.deleteBlobs(this.jobsPath(result.jobId, 'pdf/'));
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const job = await this.lockJob(tx, result.jobId);
      if (!job || !BATCH_PHASE_STATUSES.includes(job.status)) return;
      const marked = await tx.pdfJobBatch.updateMany({
        where: {
          jobId: job.id,
          batchIndex: result.batchIndex,
          status: PdfBatchStatus.PENDING,
        },
        data: { status: PdfBatchStatus.DONE, attempts: result.attempt },
      });
      if (marked.count === 0) return;
      await tx.pdfJob.update({
        where: { id: job.id },
        data: { completedDocuments: { increment: result.documentCount } },
      });
      const remaining = await tx.pdfJobBatch.count({
        where: { jobId: job.id, status: { not: PdfBatchStatus.DONE } },
      });
      if (remaining > 0) return;
      await tx.pdfJob.update({
        where: { id: job.id },
        data: { status: PdfJobStatus.ASSEMBLING },
      });
      const message: AssembleZipMessage = {
        schemaVersion: 1,
        type: 'assemble-zip',
        jobId: job.id,
        sourcePrefix: this.jobsPath(job.id, 'pdf/'),
        zipBlob: this.jobsPath(job.id, 'result.zip'),
        expectedFiles: job.totalDocuments,
      };
      // Inside the transaction: if sending fails, the batch goes back to
      // PENDING and the redelivered result tries again.
      await this.pdf.storage().sendWork(JSON.stringify(message));
    });
  }

  private async lockJob(
    tx: Prisma.TransactionClient,
    jobId: string,
  ): Promise<PdfJob | null> {
    await tx.$queryRaw`SELECT 1 FROM "pdf_jobs" WHERE "id" = ${jobId} FOR UPDATE`;
    return tx.pdfJob.findUnique({ where: { id: jobId } });
  }

  // All or nothing: hands the consecutive range back (no gaps), deletes the
  // resolutions or payment orders the job issued (re-rendered resolutions
  // aren't linked to it, so they stay), marks it FAILED and deletes its blobs.
  async revert(
    jobId: string,
    errorCode: string,
    errorDetails?: Record<string, unknown>,
    fromStatuses: PdfJobStatus[] = ACTIVE_JOB_STATUSES,
  ): Promise<void> {
    const reverted = await this.prisma.$transaction(
      async (tx) => {
        const job = await this.lockJob(tx, jobId);
        if (!job || !fromStatuses.includes(job.status)) return false;
        if (job.firstSequence !== null && job.lastSequence !== null) {
          const counterKind =
            job.documentType === PdfDocumentType.MANDAMIENTO
              ? 'paymentOrder'
              : 'resolution';
          const counter = await lockCounter(
            tx,
            job.municipalityId,
            job.year,
            counterKind,
          );
          const target = counterAfterRevert(
            counter,
            job.firstSequence,
            job.lastSequence,
          );
          if (target === null) {
            this.logger.warn(
              `job ${jobId}: counter moved to ${counter} after the job; left as is`,
            );
          } else {
            const counterUpdate = {
              where: {
                municipalityId_year: {
                  municipalityId: job.municipalityId,
                  year: job.year,
                },
              },
              data: { lastSequence: target },
            };
            await (counterKind === 'paymentOrder'
              ? tx.paymentOrderCounter.update(counterUpdate)
              : tx.resolutionCounter.update(counterUpdate));
          }
        }
        await tx.settlement.updateMany({
          where: { resolution: { is: { pdfJobId: jobId } } },
          data: { resolutionId: null },
        });
        await tx.resolution.deleteMany({ where: { pdfJobId: jobId } });
        await tx.settlement.updateMany({
          where: { paymentOrder: { is: { pdfJobId: jobId } } },
          data: { paymentOrderId: null },
        });
        await tx.paymentOrder.deleteMany({ where: { pdfJobId: jobId } });
        await tx.pdfJobBatch.deleteMany({ where: { jobId } });
        await tx.pdfJob.update({
          where: { id: jobId },
          data: {
            status: PdfJobStatus.FAILED,
            errorCode,
            errorDetails: errorDetails
              ? (errorDetails as Prisma.InputJsonObject)
              : Prisma.DbNull,
            finishedAt: new Date(),
          },
        });
        return true;
      },
      { timeout: 60_000 },
    );
    if (reverted) {
      this.logger.warn(`job ${jobId} failed (${errorCode}) and was reverted`);
      await this.deleteBlobs(this.jobsPath(jobId));
    }
  }

  // ponytail: assumes one backend instance; with several, a restarting one
  // would revert a job another instance is still preparing.
  async recoverInterrupted(): Promise<void> {
    const interrupted = await this.prisma.pdfJob.findMany({
      where: { status: PdfJobStatus.PREPARING },
      select: { id: true },
    });
    for (const { id } of interrupted) {
      await this.revert(id, ErrorCode.BULK_JOB_STALLED, {
        reason: 'backend restarted while preparing',
      });
    }
  }

  // Every few minutes: expired ZIPs are deleted, and jobs without progress
  // for JOB_WATCHDOG_MINUTES are failed and reverted.
  async sweep(now = new Date()): Promise<void> {
    const expired = await this.prisma.pdfJob.findMany({
      where: { status: PdfJobStatus.DONE, expiresAt: { lte: now } },
      select: { id: true },
    });
    for (const { id } of expired) {
      await this.prisma.pdfJob.update({
        where: { id },
        data: { status: PdfJobStatus.EXPIRED },
      });
      await this.deleteBlobs(this.jobsPath(id));
    }

    const stalled = await this.prisma.pdfJob.findMany({
      where: {
        status: { in: [PdfJobStatus.RUNNING, PdfJobStatus.ASSEMBLING] },
        updatedAt: {
          lt: minutesBefore(now, this.pdf.config.watchdogMinutes),
        },
      },
      select: { id: true },
    });
    for (const { id } of stalled) {
      await this.revert(id, ErrorCode.BULK_JOB_STALLED, undefined, [
        PdfJobStatus.RUNNING,
        PdfJobStatus.ASSEMBLING,
      ]);
    }
  }

  private async deleteBlobs(prefix: string): Promise<void> {
    try {
      await this.pdf.storage().deletePrefix(prefix);
    } catch (error) {
      if (error instanceof HttpException) return;
      this.logger.warn(
        `could not delete ${prefix}: ${(error as Error).message}`,
      );
    }
  }
}
