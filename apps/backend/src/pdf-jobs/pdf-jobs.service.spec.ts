import { PdfDocumentType, PdfJobStatus, ResolutionKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import { currentYearInColombia } from '../tax-roll/period-rules.js';
import { PdfJobsService } from './pdf-jobs.service.js';
import { pdfConfig } from './pdf-service.client.js';

const MUNICIPALITY_ID = 1;
const YEAR = currentYearInColombia();
const TEMPLATE = { blob: 'templates/paez/liquidacion/1.docx', sha256: 'abc' };
const MP_TEMPLATE = {
  blob: 'templates/paez/mandamiento/1.docx',
  sha256: 'def',
};
const DAY_MS = 24 * 60 * 60 * 1000;
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

// A settlement "En firme" (resolution 90 days old) that a payment order can
// charge. Capital 1000 in Impuesto Predial.
function firmSettlement(
  id: number,
  propertyId: number,
  period: number,
  overrides: Record<string, unknown> = {},
  address = 'FINCA',
) {
  return {
    id,
    propertyId,
    period,
    status: 'EN_FIRME',
    replacedAt: null,
    details: [{ concept: 'Impuesto Predial', amount: decimal(1000) }],
    property: {
      cadastralCode: `15514000${propertyId}`,
      address,
      owners: [{ owner: { name: 'ANA' } }],
    },
    resolution: {
      number: `${YEAR}-000${propertyId}`,
      issuedAt: new Date(Date.now() - 90 * DAY_MS),
    },
    paymentOrder: null,
    ...overrides,
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
    // The settlements the fake database holds: a query by ids gets those, any
    // other one (the plan of a liquidations job) gets all of them.
    rows: [] as { id: number }[],
    settlement: {
      findMany: vi.fn(async (args: { where?: { id?: { in: number[] } } }) => {
        const ids = args.where?.id?.in;
        return ids
          ? prisma.rows.filter((row) => ids.includes(row.id))
          : prisma.rows;
      }),
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
    paymentOrder: {
      createManyAndReturn: vi.fn(
        async ({ data }: { data: { number: string }[] }) =>
          data.map((order, i) => ({
            id: 200 + i,
            number: order.number,
            issuedAt: new Date('2026-10-16T12:00:00Z'),
          })),
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    paymentOrderCounter: {
      upsert: vi.fn(
        async ({
          update,
        }: {
          update: { lastSequence: { increment: number } };
        }) => {
          prisma.paymentOrderCounter.value += update.lastSequence.increment;
          return { lastSequence: prisma.paymentOrderCounter.value };
        },
      ),
      update: vi.fn(async ({ data }: { data: { lastSequence: number } }) => {
        prisma.paymentOrderCounter.value = data.lastSequence;
      }),
      value: 41,
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
      createMany: vi.fn(
        async (args: { data: { documentCount: number }[] }) => ({
          count: args.data.length,
        }),
      ),
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
    $queryRaw: vi.fn(async (_strings: unknown, ...values: unknown[]) => {
      const table = (values[0] as { sql?: string } | undefined)?.sql ?? '';
      return [
        {
          lastSequence: table.includes('payment_order')
            ? prisma.paymentOrderCounter.value
            : prisma.counter,
        },
      ];
    }),
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
      activeTemplate: vi.fn(async () => MP_TEMPLATE),
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
      prisma.rows = [
        pendingSettlement(1, 1),
        pendingSettlement(2, 2, ''),
        pendingSettlement(3, 3, '  '),
      ];

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
      prisma.rows = [
        pendingSettlement(1, 1),
        pendingSettlement(2, 2),
        pendingSettlement(3, 3),
      ];

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

    it('reads the data a chunk at a time and keeps the batches numbered across chunks', async () => {
      // batchSize 2 x 16 batches = chunks of 32 documents: 71 documents are 3
      // chunks and 36 batches, the last with a single document.
      prisma.rows = Array.from({ length: 71 }, (_, i) =>
        pendingSettlement(i + 1, i + 1),
      );

      await service.create(MUNICIPALITY_ID, 7, ResolutionKind.NORMAL);

      const dataReads = prisma.settlement.findMany.mock.calls
        .map(([args]) => args.where?.id?.in)
        .filter((ids) => ids !== undefined);
      // Once to check and once to enqueue, never all the documents together.
      expect(dataReads.map((ids) => ids!.length)).toEqual([
        32, 32, 7, 32, 32, 7,
      ]);
      const batchPath = (i: number) =>
        `pdf-jobs/${JOB_ID}/input/batch-${String(i).padStart(3, '0')}.json`;
      expect(storage.uploads.map((u) => u.path).sort()).toEqual(
        Array.from({ length: 36 }, (_, i) => batchPath(i)),
      );
      expect(
        storage.sent.map((m) => m.batchIndex as number).sort((a, b) => a - b),
      ).toEqual(Array.from({ length: 36 }, (_, i) => i));
      const counts = prisma.pdfJobBatch.createMany.mock.calls[0]![0].data.map(
        (row) => row.documentCount,
      );
      expect(counts).toEqual([...Array(35).fill(2), 1]);
    });

    it('fails with 409 and rolls back when a settlement changed meanwhile', async () => {
      prisma.rows = [pendingSettlement(1, 1)];
      prisma.$executeRaw.mockResolvedValue(0);

      await expect(
        service.create(MUNICIPALITY_ID, 7, ResolutionKind.NORMAL),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.LIQUIDATION_CONCURRENT_GENERATION },
      });
      expect(storage.sent).toEqual([]);
    });
  });

  describe('createPaymentOrders', () => {
    it('answers 409 while the municipality has an active job', async () => {
      prisma.pdfJob.findFirst.mockResolvedValueOnce(job());

      await expect(
        service.createPaymentOrders(MUNICIPALITY_ID, 7, [1]),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.BULK_GENERATION_IN_PROGRESS },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lists every settlement that cannot get a payment order and reserves nothing', async () => {
      prisma.rows = [
        firmSettlement(1, 1, 2022),
        firmSettlement(2, 2, 2022, { status: 'PAGADA' }),
        firmSettlement(3, 3, 2022, { paymentOrder: { id: 9 } }),
      ];

      await expect(
        service.createPaymentOrders(MUNICIPALITY_ID, 7, [1, 2, 3, 99]),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.PAYMENT_ORDER_INELIGIBLE,
          details: {
            settlements: [
              { settlementId: 2, reason: 'STATUS_NOT_ELIGIBLE' },
              { settlementId: 3, reason: 'ALREADY_HAS_PAYMENT_ORDER' },
              { settlementId: 99, reason: 'SETTLEMENT_NOT_FOUND' },
            ],
          },
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('lists every incomplete document and reserves nothing', async () => {
      prisma.rows = [
        firmSettlement(1, 1, 2022),
        firmSettlement(2, 2, 2022, {}, ''),
      ];

      await expect(
        service.createPaymentOrders(MUNICIPALITY_ID, 7, [1, 2]),
      ).rejects.toMatchObject({
        response: {
          code: ErrorCode.LIQUIDATION_DATA_INCOMPLETE,
          details: {
            documents: [
              {
                cadastralCode: '155140002',
                periods: [2022],
                missing: ['PROPERTY_ADDRESS'],
              },
            ],
          },
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('issues one payment order per property from the payment order counter and enqueues a MANDAMIENTO job', async () => {
      prisma.rows = [
        firmSettlement(1, 1, 2021),
        firmSettlement(2, 1, 2022, {
          resolution: { number: `${YEAR}-0050`, issuedAt: new Date(0) },
          details: [{ concept: 'C.A.R.', amount: decimal(500) }],
        }),
        firmSettlement(3, 2, 2022),
      ];

      const created = await service.createPaymentOrders(
        MUNICIPALITY_ID,
        7,
        [3, 2, 1],
      );

      expect(created).toEqual({
        jobId: JOB_ID,
        status: PdfJobStatus.RUNNING,
        totalDocuments: 2,
      });
      expect(prisma.pdfJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentType: PdfDocumentType.MANDAMIENTO,
          totalDocuments: 2,
          firstSequence: 42,
          lastSequence: 43,
          createdById: 7,
          templateSha256: 'def',
        }),
      });
      expect(prisma.paymentOrderCounter.value).toBe(43);
      expect(prisma.counter).toBe(41); // the liquidation counter is untouched
      expect(prisma.paymentOrder.createManyAndReturn).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              propertyId: 1,
              number: `${YEAR}-0042`,
              pdfJobId: JOB_ID,
            }),
            expect.objectContaining({
              propertyId: 2,
              number: `${YEAR}-0043`,
              pdfJobId: JOB_ID,
            }),
          ],
        }),
      );

      expect(storage.uploads.map((u) => u.path)).toEqual([
        `pdf-jobs/${JOB_ID}/input/batch-000.json`,
      ]);
      expect(storage.uploads[0]!.body).toEqual({
        documents: [
          {
            fileName: `Mandamientos de pago/MP-${YEAR}-0042.pdf`,
            data: expect.objectContaining({
              paymentOrderNumber: `${YEAR}-0042`,
              capitalAmount: '$ 1.500',
              startYear: '2021',
              endYear: '2022',
              liquidations: [
                { number: `${YEAR}-0001`, separator: ' y ' },
                { number: `${YEAR}-0050`, separator: '' },
              ],
            }),
          },
          {
            fileName: `Mandamientos de pago/MP-${YEAR}-0043.pdf`,
            data: expect.objectContaining({ capitalAmount: '$ 1.000' }),
          },
        ],
      });
      expect(storage.sent).toEqual([
        expect.objectContaining({
          type: 'render-batch',
          documentType: PdfDocumentType.MANDAMIENTO,
          template: MP_TEMPLATE,
        }),
      ]);
    });

    it('fails with 409 and rolls back when a settlement changed meanwhile', async () => {
      prisma.rows = [firmSettlement(1, 1, 2022)];
      prisma.$executeRaw.mockResolvedValue(0);

      await expect(
        service.createPaymentOrders(MUNICIPALITY_ID, 7, [1]),
      ).rejects.toMatchObject({
        response: { code: ErrorCode.PAYMENT_ORDER_CONCURRENT_GENERATION },
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

    it('names the ZIP of a payment orders job after the payment orders', async () => {
      storage.zip = 'zip-stream';
      prisma.pdfJob.findFirst.mockResolvedValue(
        job({
          documentType: PdfDocumentType.MANDAMIENTO,
          kind: null,
          status: PdfJobStatus.DONE,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      );

      await expect(
        service.download(MUNICIPALITY_ID, JOB_ID),
      ).resolves.toMatchObject({ fileName: 'mandamientos-de-pago.zip' });
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

    it('a failed payment orders job hands back the payment order range and unlinks its settlements', async () => {
      prisma.paymentOrderCounter.value = 43;
      prisma.pdfJob.findUnique.mockResolvedValue(
        job({
          documentType: PdfDocumentType.MANDAMIENTO,
          kind: null,
          firstSequence: 42,
          lastSequence: 43,
        }),
      );

      await service.applyResult({
        schemaVersion: 1,
        type: 'batch-result',
        jobId: JOB_ID,
        batchIndex: 0,
        status: 'FAILED',
        attempt: 3,
        errorCode: 'PDF_CONVERSION_TIMEOUT',
      });

      expect(prisma.paymentOrderCounter.value).toBe(41);
      expect(prisma.counter).toBe(41); // liquidation counter untouched
      expect(prisma.resolutionCounter.update).not.toHaveBeenCalled();
      expect(prisma.settlement.updateMany).toHaveBeenCalledWith({
        where: { paymentOrder: { is: { pdfJobId: JOB_ID } } },
        data: { paymentOrderId: null },
      });
      expect(prisma.paymentOrder.deleteMany).toHaveBeenCalledWith({
        where: { pdfJobId: JOB_ID },
      });
      expect(prisma.pdfJob.update).toHaveBeenCalledWith({
        where: { id: JOB_ID },
        data: expect.objectContaining({ status: PdfJobStatus.FAILED }),
      });
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
