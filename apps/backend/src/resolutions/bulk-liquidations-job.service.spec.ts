import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ResolutionKind } from '@prisma/client';
import { validate } from 'class-validator';
import { existsSync } from 'node:fs';
import PizZip from 'pizzip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors/error-codes.js';
import {
  currentYearInColombia,
  PRESCRIPTION_YEARS,
} from '../tax-roll/period-rules.js';
import { StartLiquidationsZipDto } from './start-liquidations-zip.dto.js';

const mocks = vi.hoisted(() => ({ batch: vi.fn(), single: vi.fn() }));

vi.mock('../liquidation-template/convert-docx-batch-to-pdf.js', () => ({
  convertDocxBatchToPdf: mocks.batch,
}));
vi.mock('../liquidation-template/convert-docx-to-pdf.js', async (original) => ({
  ...(await original<
    typeof import('../liquidation-template/convert-docx-to-pdf.js')
  >()),
  convertDocxToPdf: mocks.single,
}));

import { PdfConversionError } from '../liquidation-template/convert-docx-to-pdf.js';
import {
  batchItems,
  BULK_BATCH_SIZE,
  BulkLiquidationsJobService,
  MAX_BULK_LIQUIDATIONS,
} from './bulk-liquidations-job.service.js';

const PDF = Buffer.from('%PDF-1.4\n%%EOF');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const MUNICIPALITY_ID = 1;
const OTHER_MUNICIPALITY_ID = 2;

// Pending settlements: one per property so each one is its own PDF.
function pending(count: number, period: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    propertyId: i + 1,
    period,
  }));
}

function buildService(
  rows: { id: number; propertyId: number; period: number }[],
  kind: ResolutionKind = ResolutionKind.NORMAL,
  generated: { kind: ResolutionKind; settlements: { id: number }[] }[] = [],
) {
  const prisma = {
    settlement: { findMany: vi.fn(async () => rows) },
    resolution: { findMany: vi.fn(async () => generated) },
  };
  const pdfService = {
    prepareLiquidationDocx: vi.fn(
      async (_municipalityId: number, id: number) => ({
        docx: Buffer.from(`docx-${id}`),
        resolutionNumber: `2026-${String(id).padStart(4, '0')}`,
        kind,
      }),
    ),
  };
  const service = new BulkLiquidationsJobService(
    prisma as never,
    pdfService as never,
  );
  return { service, pdfService, prisma };
}

async function finished(service: BulkLiquidationsJobService, jobId: string) {
  await vi.waitFor(
    () =>
      expect(service.get(MUNICIPALITY_ID, jobId).status).not.toBe('running'),
    { timeout: 5_000, interval: 5 },
  );
  return service.get(MUNICIPALITY_ID, jobId);
}

const okBatch = async (docs: { name: string }[]) =>
  new Map(docs.map((doc) => [doc.name, { pdf: PDF }]));

describe('bulk liquidation jobs', () => {
  const previousWorkers = process.env.BULK_PDF_WORKERS;

  beforeEach(() => {
    mocks.batch.mockReset();
    mocks.single.mockReset();
    mocks.batch.mockImplementation(okBatch);
    mocks.single.mockResolvedValue(PDF);
    process.env.BULK_PDF_WORKERS = '2';
  });

  afterEach(() => {
    if (previousWorkers === undefined) delete process.env.BULK_PDF_WORKERS;
    else process.env.BULK_PDF_WORKERS = previousWorkers;
  });

  it('splits work into fixed-size batches', () => {
    expect(
      batchItems(Array.from({ length: 23 }, (_, i) => i)).map((b) => b.length),
    ).toEqual([10, 10, 3]);
    expect(BULK_BATCH_SIZE).toBe(10);
  });

  it('counts pending PDFs by type', async () => {
    const year = currentYearInColombia();
    const { service } = buildService([
      { id: 1, propertyId: 1, period: year - PRESCRIPTION_YEARS },
      { id: 2, propertyId: 1, period: year },
      { id: 3, propertyId: 2, period: year },
    ]);

    // Property 1 yields one PDF per type; property 2 only a current one.
    await expect(service.pendingCounts(MUNICIPALITY_ID)).resolves.toEqual({
      prescriptionRisk: 1,
      normal: 2,
    });
  });

  it('includes already generated resolutions so a ZIP can be downloaded again', async () => {
    const year = currentYearInColombia();
    // Nothing pending: every settlement already belongs to a resolution.
    const { service, pdfService } = buildService([], ResolutionKind.NORMAL, [
      { kind: ResolutionKind.NORMAL, settlements: [{ id: 11 }] },
      { kind: ResolutionKind.NORMAL, settlements: [{ id: 12 }] },
      { kind: ResolutionKind.PRESCRIPTION_RISK, settlements: [{ id: 13 }] },
    ]);

    await expect(service.pendingCounts(MUNICIPALITY_ID)).resolves.toEqual({
      prescriptionRisk: 1,
      normal: 2,
    });

    const { jobId } = await service.start(
      MUNICIPALITY_ID,
      ResolutionKind.NORMAL,
    );
    const job = await finished(service, jobId);
    expect(job).toMatchObject({ status: 'done', total: 2, completed: 2 });
    expect(
      pdfService.prepareLiquidationDocx.mock.calls.map(([, id]) => id).sort(),
    ).toEqual([11, 12]);

    // Downloading and generating again is allowed: nothing is consumed.
    service.deleteDownloadedJob(jobId);
    const again = await service.start(MUNICIPALITY_ID, ResolutionKind.NORMAL);
    expect((await finished(service, again.jobId)).status).toBe('done');
    expect(year).toBeGreaterThan(2000);
  });

  it('rejects an unknown job, a type without liquidations and an oversized batch', async () => {
    const year = currentYearInColombia();
    const { service } = buildService(pending(2, year));

    expect(() => service.get(MUNICIPALITY_ID, 'missing')).toThrow(
      NotFoundException,
    );
    await expect(
      service.start(MUNICIPALITY_ID, ResolutionKind.PRESCRIPTION_RISK),
    ).rejects.toBeInstanceOf(NotFoundException);

    const { service: big } = buildService(
      pending(MAX_BULK_LIQUIDATIONS + 1, year),
    );
    await expect(
      big.start(MUNICIPALITY_ID, ResolutionKind.NORMAL),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('runs a job to completion and builds the ZIP with every PDF', async () => {
    const year = currentYearInColombia();
    const { service } = buildService(pending(25, year));

    const { jobId } = await service.start(
      MUNICIPALITY_ID,
      ResolutionKind.NORMAL,
    );
    expect(service.getActive(MUNICIPALITY_ID)?.jobId).toBe(jobId);
    const job = await finished(service, jobId);

    expect(job).toMatchObject({ status: 'done', total: 25, completed: 25 });
    expect(job.finishedAt).not.toBeNull();
    expect(service.getActive(MUNICIPALITY_ID)).toBeNull();

    const zip = new PizZip(service.download(MUNICIPALITY_ID, jobId));
    const folder = `Liquidaciones ${year - PRESCRIPTION_YEARS + 1} en adelante`;
    const names = Object.keys(zip.files).filter(
      (name) => !zip.files[name]!.dir,
    );
    expect(names).toHaveLength(25);
    expect(names.every((name) => name.startsWith(`${folder}/2026-`))).toBe(
      true,
    );
  });

  it('never runs more converters at once than the configured workers', async () => {
    const year = currentYearInColombia();
    process.env.BULK_PDF_WORKERS = '3';
    let inFlight = 0;
    let peak = 0;
    mocks.batch.mockImplementation(async (docs: { name: string }[]) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(15);
      inFlight -= 1;
      return okBatch(docs);
    });
    const { service } = buildService(pending(80, year));

    const { jobId } = await service.start(
      MUNICIPALITY_ID,
      ResolutionKind.NORMAL,
    );
    await finished(service, jobId);

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('reports monotonic progress up to the total', async () => {
    const year = currentYearInColombia();
    mocks.batch.mockImplementation(async (docs: { name: string }[]) => {
      await sleep(10);
      return okBatch(docs);
    });
    const { service } = buildService(pending(60, year));

    const { jobId } = await service.start(
      MUNICIPALITY_ID,
      ResolutionKind.NORMAL,
    );
    const seen: number[] = [];
    while (service.get(MUNICIPALITY_ID, jobId).status === 'running') {
      seen.push(service.get(MUNICIPALITY_ID, jobId).completed);
      await sleep(3);
    }
    seen.push(service.get(MUNICIPALITY_ID, jobId).completed);

    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen.at(-1)).toBe(60);
    expect(new Set(seen).size).toBeGreaterThan(2);
  });

  it('retries only the documents a batch could not convert', async () => {
    const year = currentYearInColombia();
    mocks.batch.mockImplementation(async (docs: { name: string }[]) => {
      const results = new Map<string, { pdf?: Buffer; error?: Error }>();
      docs.forEach((doc, index) =>
        results.set(
          doc.name,
          index === 1
            ? { error: new Error('batch failed for this document') }
            : { pdf: PDF },
        ),
      );
      return results;
    });
    const { service } = buildService(pending(20, year));

    const { jobId } = await service.start(
      MUNICIPALITY_ID,
      ResolutionKind.NORMAL,
    );
    const job = await finished(service, jobId);

    expect(job.status).toBe('done');
    expect(mocks.single).toHaveBeenCalledTimes(2); // one failed doc per batch
  });

  it('fails the job with the error code and stops taking batches', async () => {
    const year = currentYearInColombia();
    process.env.BULK_PDF_WORKERS = '1';
    mocks.batch.mockImplementation(
      async (docs: { name: string }[]) =>
        new Map(docs.map((doc) => [doc.name, { error: new Error('failed') }])),
    );
    mocks.single.mockRejectedValue(
      new PdfConversionError(
        ErrorCode.PDF_CONVERSION_FAILED,
        'LibreOffice could not convert the liquidation to PDF.',
      ),
    );
    const { service, pdfService } = buildService(pending(100, year));

    const { jobId } = await service.start(
      MUNICIPALITY_ID,
      ResolutionKind.NORMAL,
    );
    const job = await finished(service, jobId);

    expect(job.status).toBe('failed');
    expect(job.errorCode).toBe(ErrorCode.PDF_CONVERSION_FAILED);
    expect(job.completed).toBe(0);
    expect(pdfService.prepareLiquidationDocx.mock.calls.length).toBeLessThan(
      100,
    );
    expect(service.getActive(MUNICIPALITY_ID)).toBeNull();
    expect(() => service.download(MUNICIPALITY_ID, jobId)).toThrow(
      ConflictException,
    );
  });

  it('enforces one running job at a time', async () => {
    const year = currentYearInColombia();
    mocks.batch.mockImplementation(async (docs: { name: string }[]) => {
      await sleep(30);
      return okBatch(docs);
    });
    const { service } = buildService(pending(30, year));

    const { jobId } = await service.start(
      MUNICIPALITY_ID,
      ResolutionKind.NORMAL,
    );
    await expect(
      service.start(MUNICIPALITY_ID, ResolutionKind.NORMAL),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(() => service.download(MUNICIPALITY_ID, jobId)).toThrow(
      ConflictException,
    );

    await finished(service, jobId);
    await expect(
      service.start(MUNICIPALITY_ID, ResolutionKind.NORMAL),
    ).resolves.toHaveProperty('jobId');
  });

  it('removes the job once it has been downloaded', async () => {
    const year = currentYearInColombia();
    const { service } = buildService(pending(5, year));

    const { jobId } = await service.start(
      MUNICIPALITY_ID,
      ResolutionKind.NORMAL,
    );
    await finished(service, jobId);
    expect(service.download(MUNICIPALITY_ID, jobId).length).toBeGreaterThan(0);

    service.deleteDownloadedJob(jobId);

    expect(() => service.get(MUNICIPALITY_ID, jobId)).toThrow(
      NotFoundException,
    );
    expect(() => service.download(MUNICIPALITY_ID, jobId)).toThrow(
      NotFoundException,
    );
  });

  it('gives every batch its own directory and deletes it afterwards', async () => {
    const year = currentYearInColombia();
    const directories: string[] = [];
    mocks.batch.mockImplementation(
      async (docs: { name: string }[], directory: string) => {
        expect(existsSync(directory)).toBe(true);
        directories.push(directory);
        return okBatch(docs);
      },
    );
    const { service } = buildService(pending(30, year));

    const { jobId } = await service.start(
      MUNICIPALITY_ID,
      ResolutionKind.NORMAL,
    );
    await finished(service, jobId);

    expect(new Set(directories).size).toBe(3);
    expect(directories.some((directory) => existsSync(directory))).toBe(false);
  });
});

describe('StartLiquidationsZipDto', () => {
  const build = (kind: unknown) =>
    Object.assign(new StartLiquidationsZipDto(), { kind });

  it('accepts only the two generation types', async () => {
    expect(await validate(build('NORMAL'))).toHaveLength(0);
    expect(await validate(build('PRESCRIPTION_RISK'))).toHaveLength(0);
    expect(await validate(build('ALL'))).not.toHaveLength(0);
    expect(await validate(build(undefined))).not.toHaveLength(0);
  });

  describe('municipality isolation', () => {
    it('looks up the pending and generated resolutions of that municipality only', async () => {
      const { service, prisma } = buildService([]);

      await service.pendingCounts(MUNICIPALITY_ID);

      expect(prisma.settlement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            property: { municipalityId: MUNICIPALITY_ID },
          }),
        }),
      );
      expect(prisma.resolution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ municipalityId: MUNICIPALITY_ID }),
        }),
      );
    });

    it('hands the municipality to every document it prepares', async () => {
      const { service, pdfService } = buildService(
        pending(3, currentYearInColombia()),
      );

      const { jobId } = await service.start(
        OTHER_MUNICIPALITY_ID,
        ResolutionKind.NORMAL,
      );
      await vi.waitFor(() =>
        expect(service.get(OTHER_MUNICIPALITY_ID, jobId).status).toBe('done'),
      );

      expect(
        pdfService.prepareLiquidationDocx.mock.calls.every(
          ([municipalityId]) => municipalityId === OTHER_MUNICIPALITY_ID,
        ),
      ).toBe(true);
    });

    it('answers "not found" for a job of another municipality, even with the right id', async () => {
      const { service } = buildService(pending(2, currentYearInColombia()));
      const { jobId } = await service.start(
        MUNICIPALITY_ID,
        ResolutionKind.NORMAL,
      );
      await vi.waitFor(() =>
        expect(service.get(MUNICIPALITY_ID, jobId).status).toBe('done'),
      );

      expect(() => service.get(OTHER_MUNICIPALITY_ID, jobId)).toThrow(
        NotFoundException,
      );
      expect(() => service.download(OTHER_MUNICIPALITY_ID, jobId)).toThrow(
        NotFoundException,
      );
      expect(service.getActive(OTHER_MUNICIPALITY_ID)).toBeNull();
      // The owner still gets it.
      expect(service.download(MUNICIPALITY_ID, jobId).length).toBeGreaterThan(
        0,
      );
    });

    it('lets two municipalities run a job at the same time', async () => {
      const { service } = buildService(pending(2, currentYearInColombia()));

      const first = await service.start(MUNICIPALITY_ID, ResolutionKind.NORMAL);
      const second = await service.start(
        OTHER_MUNICIPALITY_ID,
        ResolutionKind.NORMAL,
      );

      expect(first.jobId).not.toBe(second.jobId);
    });
  });
});
