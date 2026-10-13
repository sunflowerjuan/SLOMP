import { PdfJobStatus, ResolutionKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import { currentYearInColombia } from '../tax-roll/period-rules.js';
import { PdfJobsService } from './pdf-jobs.service.js';
import { pdfConfig } from './pdf-service.client.js';

const MUNICIPALITY_ID = 1;
const YEAR = currentYearInColombia();
const TEMPLATE = { blob: 'templates/paez/liquidacion/1.docx', sha256: 'abc' };
const JOB_ID = '7f3c2a10-5b1e-4c7d-9a2f-0e8b1d6c4a55';

function decimal(value: number) {
  return { toNumber: () => value };
}

function pendingSettlement(id: number, propertyId: number, address = 'FINCA') {
  return {
    id,
    propertyId,
    period: YEAR - 1, // normal collection
    details: [{ concept: 'Impuesto Predial', amount: decimal(1000) }],
    property: {
      cadastralCode: `15514000${propertyId}`,
      address,
      owners: [{ owner: { name: 'ANA' } }],
    },
  };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    municipalityId: MUNICIPALITY_ID,
    documentType: 'LIQUIDACION',
    kind: ResolutionKind.NORMAL,
    status: PdfJobStatus.RUNNING,
    totalDocuments: 3,
    completedDocuments: 0,
    totalBatches: 2,
    year: YEAR,
    firstSequence: 42,
    lastSequence: 44,
    expiresAt: null,
    ...overrides,
  };
}

function fakeStorage() {
  return {
    uploads: [] as { path: string; body: unknown }[],
    sent: [] as Record<string, unknown>[],
    deleted: [] as string[],
    zip: null as unknown,
    ensureCreated: vi.fn(async () => {}),
    async upload(path: string, data: Buffer) {
      this.uploads.push({ path, body: JSON.parse(data.toString()) });
    },
    async sendWork(text: string) {
      this.sent.push(JSON.parse(text));
    },
    async deletePrefix(prefix: string) {
      this.deleted.push(prefix);
    },
    async openRead() {
      return this.zip;
    },
    receiveResults: vi.fn(async () => []),
  };
}

function fakePrisma() {
  const prisma = {
    counter: 41,
    settlement: {
      findMany: vi.fn(async () => [] as unknown[]),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    resolution: {
      findMany: vi.fn(async () => [] as unknown[]),
      groupBy: vi.fn(async () => []),
      createManyAndReturn: vi.fn(
        async ({ data }: { data: { number: string }[] }) =>
          data.map((r, i) => ({ id: 100 + i, number: r.number })),
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    resolutionCounter: {
      update: vi.fn(async ({ data }: { data: { lastSequence: number } }) => {
        prisma.counter = data.lastSequence;
      }),
    },
    pdfJob: {
      findFirst: vi.fn(async () => null as unknown),
      findUnique: vi.fn(async () => null as unknown),
      findMany: vi.fn(async () => [] as unknown[]),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) =>
        job({ ...data, status: PdfJobStatus.PREPARING }),
      ),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    pdfJobBatch: {
      createMany: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 1 })),
      count: vi.fn(async () => 1),
      deleteMany: vi.fn(async () => ({})),
    },
    // lockCounter's INSERT, and the one UPDATE that links the settlements.
    $executeRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) =>
        strings.join('').includes('UPDATE "settlements"')
          ? (values[0] as number[]).length
          : 1,
    ),
    // lockCounter's SELECT ... FOR UPDATE (and the job row lock).
    $queryRaw: vi.fn(async () => [{ lastSequence: prisma.counter }]),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return prisma;
}

describe('PdfJobsService', () => {
  let prisma: ReturnType<typeof fakePrisma>;
  let storage: ReturnType<typeof fakeStorage>;
  let service: PdfJobsService;

  beforeEach(() => {
    prisma = fakePrisma();
    storage = fakeStorage();
    const client = {
      config: { ...pdfConfig(), batchSize: 2 },
      storage: () => storage,
      liquidationTemplate: vi.fn(async () => TEMPLATE),
    };
    service = new PdfJobsService(prisma as never, client as never);
  });

  describe('create', () => {
    it('answers 409 while the municipality has an active job', async () => {
      prisma.pdfJob.findFirst.mockResolvedValueOnce(job());

      await expect(
        service.create(MUNICIPALITY_ID, 7, ResolutionKind.NORMAL),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.BULK_GENERATION_IN_PROGRESS },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lists every incomplete document and reserves nothing', async () => {
      prisma.settlement.findMany.mockResolvedValueOnce([
        pendingSettlement(1, 1),
        pendingSettlement(2, 2, ''),
        pendingSettlement(3, 3, '  '),
      ]);

      await expect(
        service.create(MUNICIPALITY_ID, 7, ResolutionKind.NORMAL),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.LIQUIDATION_DATA_INCOMPLETE,
          details: {
            documents: [
              {
                cadastralCode: '155140002',
                periods: [YEAR - 1],
                missing: ['PROPERTY_ADDRESS'],
              },
              {
                cadastralCode: '155140003',
                periods: [YEAR - 1],
                missing: ['PROPERTY_ADDRESS'],
              },
            ],
          },
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('answers 404 when there is nothing of that kind to generate', async () => {
      await expect(
        service.create(MUNICIPALITY_ID, 7, ResolutionKind.NORMAL),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.NO_PENDING_LIQUIDATIONS },
      });
    });

    it('reserves the range under the lock and enqueues one render-batch per batch', async () => {
      prisma.settlement.findMany.mockResolvedValueOnce([
        pendingSettlement(1, 1),
        pendingSettlement(2, 2),
        pendingSettlement(3, 3),
      ]);

      const created = await service.create(
        MUNICIPALITY_ID,
        7,
        ResolutionKind.NORMAL,
      );

      expect(created).toEqual({
        jobId: JOB_ID,
        status: PdfJobStatus.RUNNING,
        totalDocuments: 3,
      });
      expect(prisma.pdfJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstSequence: 42,
          lastSequence: 44,
          createdById: 7,
          templateSha256: 'abc',
        }),
      });
      expect(prisma.counter).toBe(44);
      expect(prisma.resolution.createManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [42, 43, 44].map((sequence) =>
            expect.objectContaining({
              number: `${YEAR}-00${sequence}`,
              pdfJobId: JOB_ID,
            }),
          ),
        }),
      );

      const folder = `Liquidaciones ${YEAR - 4} en adelante`;
      expect(storage.uploads.map((u) => u.path)).toEqual([
        `pdf-jobs/${JOB_ID}/input/batch-000.json`,
        `pdf-jobs/${JOB_ID}/input/batch-001.json`,
      ]);
      expect(storage.uploads[1]!.body).toEqual({
        documents: [
          {
            fileName: `${folder}/${YEAR}-0044.pdf`,
            data: expect.objectContaining({ resolutionNumber: `${YEAR}-0044` }),
          },
        ],
      });
      expect(storage.sent).toEqual(
        [0, 1].map((batchIndex) =>
          expect.objectContaining({
            schemaVersion: 1,
            type: 'render-batch',
            batchIndex,
            template: TEMPLATE,
            outputPrefix: `pdf-jobs/${JOB_ID}/pdf/`,
          }),
        ),
      );
      expect(prisma.pdfJob.updateMany).toHaveBeenCalledWith({
        where: { id: JOB_ID, status: PdfJobStatus.PREPARING },
        data: { status: PdfJobStatus.RUNNING },
      });
    });

    it('fails with 409 and rolls back when a settlement changed meanwhile', async () => {
      prisma.settlement.findMany.mockResolvedValueOnce([
        pendingSettlement(1, 1),
      ]);
      prisma.$executeRaw.mockResolvedValue(0);

      await expect(
        service.create(MUNICIPALITY_ID, 7, ResolutionKind.NORMAL),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.LIQUIDATION_CONCURRENT_GENERATION },
      });
      expect(storage.sent).toEqual([]);
    });
  });

  describe('download', () => {
    it('answers 404 for a job of another municipality', async () => {
      await expect(service.download(2, JOB_ID)).rejects.toMatchObject({
        response: { code: ErrorCode.BULK_JOB_NOT_FOUND },
      });
    });

    it('answers 409 while running and 410 once expired', async () => {
      prisma.pdfJob.findFirst.mockResolvedValueOnce(job());
      await expect(
        service.download(MUNICIPALITY_ID, JOB_ID),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.BULK_JOB_NOT_READY },
      });

      const now = new Date('2026-10-13T12:00:00Z');
      prisma.pdfJob.findFirst.mockResolvedValueOnce(
        job({
          status: PdfJobStatus.DONE,
          expiresAt: new Date('2026-10-13T11:59:00Z'),
        }),
      );
      await expect(
        service.download(MUNICIPALITY_ID, JOB_ID, now),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.BULK_JOB_EXPIRED },
      });
    });

    it('streams the ZIP of a finished job as many times as needed', async () => {
      storage.zip = 'zip-stream';
      const done = job({
        status: PdfJobStatus.DONE,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.pdfJob.findFirst.mockResolvedValue(done);

      for (let i = 0; i < 2; i++) {
        await expect(
          service.download(MUNICIPALITY_ID, JOB_ID),
        ).resolves.toEqual({
          stream: 'zip-stream',
          fileName: 'liquidaciones-cobro-normal.zip',
        });
      }
    });
  });

  describe('applyResult', () => {
    const batchDone = {
      schemaVersion: 1 as const,
      type: 'batch-result' as const,
      jobId: JOB_ID,
      batchIndex: 0,
      status: 'DONE' as const,
      documentCount: 2,
      attempt: 1,
    };

    it('counts a batch once even when its result arrives twice', async () => {
      prisma.pdfJob.findUnique.mockResolvedValue(job());
      prisma.pdfJobBatch.updateMany
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 });

      await service.applyResult(batchDone);
      await service.applyResult(batchDone);

      expect(prisma.pdfJob.update).toHaveBeenCalledTimes(1);
      expect(prisma.pdfJob.update).toHaveBeenCalledWith({
        where: { id: JOB_ID },
        data: { completedDocuments: { increment: 2 } },
      });
      expect(storage.sent).toEqual([]);
    });

    it('moves to ASSEMBLING and enqueues assemble-zip after the last batch', async () => {
      prisma.pdfJob.findUnique.mockResolvedValue(job());
      prisma.pdfJobBatch.count.mockResolvedValueOnce(0);

      await service.applyResult(batchDone);

      expect(prisma.pdfJob.update).toHaveBeenLastCalledWith({
        where: { id: JOB_ID },
        data: { status: PdfJobStatus.ASSEMBLING },
      });
      expect(storage.sent).toEqual([
        {
          schemaVersion: 1,
          type: 'assemble-zip',
          jobId: JOB_ID,
          sourcePrefix: `pdf-jobs/${JOB_ID}/pdf/`,
          zipBlob: `pdf-jobs/${JOB_ID}/result.zip`,
          expectedFiles: 3,
        },
      ]);
    });

    it('drops a late result of a job that already failed', async () => {
      prisma.pdfJob.findUnique.mockResolvedValue(
        job({ status: PdfJobStatus.FAILED }),
      );

      await service.applyResult(batchDone);

      expect(prisma.pdfJobBatch.updateMany).not.toHaveBeenCalled();
    });

    it('a failed batch reverts the job: counter back, resolutions and blobs deleted', async () => {
      prisma.counter = 44;
      prisma.pdfJob.findUnique.mockResolvedValue(job());

      await service.applyResult({
        schemaVersion: 1,
        type: 'batch-result',
        jobId: JOB_ID,
        batchIndex: 1,
        status: 'FAILED',
        attempt: 3,
        errorCode: 'PDF_CONVERSION_TIMEOUT',
      });

      expect(prisma.counter).toBe(41);
      expect(prisma.settlement.updateMany).toHaveBeenCalledWith({
        where: { resolution: { is: { pdfJobId: JOB_ID } } },
        data: { resolutionId: null },
      });
      expect(prisma.resolution.deleteMany).toHaveBeenCalledWith({
        where: { pdfJobId: JOB_ID },
      });
      expect(prisma.pdfJob.update).toHaveBeenCalledWith({
        where: { id: JOB_ID },
        data: expect.objectContaining({
          status: PdfJobStatus.FAILED,
          errorCode: 'PDF_CONVERSION_TIMEOUT',
          errorDetails: { batchIndex: 1 },
        }),
      });
      expect(storage.deleted).toEqual([`pdf-jobs/${JOB_ID}/`]);
    });

    it('a finished ZIP marks the job DONE for an hour and keeps only the ZIP', async () => {
      const now = new Date('2026-10-13T12:00:00Z');
      await service.applyResult(
        {
          schemaVersion: 1,
          type: 'zip-result',
          jobId: JOB_ID,
          status: 'DONE',
          sizeBytes: 10,
        },
        now,
      );

      expect(prisma.pdfJob.updateMany).toHaveBeenCalledWith({
        where: { id: JOB_ID, status: PdfJobStatus.ASSEMBLING },
        data: {
          status: PdfJobStatus.DONE,
          finishedAt: now,
          expiresAt: new Date('2026-10-13T13:00:00Z'),
        },
      });
      expect(storage.deleted).toEqual([
        `pdf-jobs/${JOB_ID}/input/`,
        `pdf-jobs/${JOB_ID}/pdf/`,
      ]);
    });
  });

  it('sweep expires old ZIPs and fails stalled jobs', async () => {
    prisma.pdfJob.findMany
      .mockResolvedValueOnce([{ id: 'expired-job' }])
      .mockResolvedValueOnce([{ id: JOB_ID }]);
    prisma.pdfJob.findUnique.mockResolvedValue(job());

    await service.sweep(new Date('2026-10-13T12:00:00Z'));

    expect(prisma.pdfJob.update).toHaveBeenCalledWith({
      where: { id: 'expired-job' },
      data: { status: PdfJobStatus.EXPIRED },
    });
    expect(prisma.pdfJob.findMany).toHaveBeenLastCalledWith({
      where: {
        status: { in: [PdfJobStatus.RUNNING, PdfJobStatus.ASSEMBLING] },
        updatedAt: { lt: new Date('2026-10-13T11:45:00Z') },
      },
      select: { id: true },
    });
    expect(prisma.pdfJob.update).toHaveBeenCalledWith({
      where: { id: JOB_ID },
      data: expect.objectContaining({
        status: PdfJobStatus.FAILED,
        errorCode: ErrorCode.BULK_JOB_STALLED,
      }),
    });
  });
});
