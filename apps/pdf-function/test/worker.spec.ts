import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';
import { createSlotPool } from '../src/slots.ts';
import { createTemplateCache } from '../src/templates.ts';
import { handleMessage, startWorker, type WorkerDeps } from '../src/worker.ts';
import { JobError } from '../src/errors.ts';
import {
  conversionError,
  FAKE_PDF,
  fakeSlot,
  fakeStorage,
  templateFixture,
} from './fakes.ts';

const JOB = 'job-1';
const TEMPLATE_BLOB = 'templates/paez/liquidacion/1.docx';

function setup(maxAttempts = 3) {
  const storage = fakeStorage();
  const { template, sha256 } = templateFixture();
  storage.blobs.files.set(TEMPLATE_BLOB, template);
  const deps: WorkerDeps = {
    storage,
    pool: createSlotPool([fakeSlot()]),
    getTemplate: createTemplateCache(storage.blobs),
    visibilitySeconds: 300,
    maxAttempts,
    pollIntervalMs: 5,
    log: () => {},
  };
  const renderBatch = (batchIndex: number, fileNames: string[]) => {
    const inputBlob = `pdf-jobs/${JOB}/input/batch-${batchIndex}.json`;
    storage.blobs.files.set(
      inputBlob,
      Buffer.from(
        JSON.stringify({
          documents: fileNames.map((fileName) => ({
            fileName,
            data: { resolutionNumber: fileName, rows: [] },
          })),
        }),
      ),
    );
    return {
      schemaVersion: 1,
      type: 'render-batch',
      jobId: JOB,
      municipalityId: 1,
      documentType: 'LIQUIDACION',
      batchIndex,
      inputBlob,
      template: { blob: TEMPLATE_BLOB, sha256 },
      outputPrefix: `pdf-jobs/${JOB}/pdf/`,
    };
  };
  return { storage, deps, renderBatch };
}

async function deliver(
  deps: WorkerDeps,
  body: unknown,
  slot = fakeSlot(),
  dequeueCount = 0,
) {
  const queue = deps.storage.work as ReturnType<typeof fakeStorage>['work'];
  queue.enqueue(body, dequeueCount);
  const [message] = await queue.receive(1);
  await handleMessage(deps, message!, slot);
  return message!;
}

describe('render-batch', () => {
  it('uploads every PDF under its file name and reports DONE', async () => {
    const { storage, deps, renderBatch } = setup();
    const message = await deliver(
      deps,
      renderBatch(3, ['A/2026-0001.pdf', 'B/2026-0002.pdf']),
    );

    expect(
      storage.blobs.files.get(`pdf-jobs/${JOB}/pdf/A/2026-0001.pdf`),
    ).toEqual(FAKE_PDF);
    expect(
      storage.blobs.files.get(`pdf-jobs/${JOB}/pdf/B/2026-0002.pdf`),
    ).toEqual(FAKE_PDF);
    expect(storage.results.sentJson()).toEqual([
      {
        schemaVersion: 1,
        type: 'batch-result',
        jobId: JOB,
        batchIndex: 3,
        status: 'DONE',
        documentCount: 2,
        attempt: 1,
      },
    ]);
    expect(storage.work.deleted).toEqual([message.messageId]);
  });

  it('retries alone a document the batch conversion skipped', async () => {
    const { storage, deps, renderBatch } = setup();
    let first = true;
    const slot = fakeSlot((docs) => {
      if (!first) return docs.map(() => FAKE_PDF);
      first = false;
      return [FAKE_PDF, conversionError()];
    });
    await deliver(deps, renderBatch(0, ['a.pdf', 'b.pdf']), slot);

    expect(slot.calls).toEqual([2, 1]);
    expect(storage.results.sentJson()[0].status).toBe('DONE');
  });

  it('leaves a transient failure in the queue until the last attempt', async () => {
    const { storage, deps, renderBatch } = setup(3);
    const failing = () => fakeSlot((docs) => docs.map(() => conversionError()));

    await deliver(deps, renderBatch(0, ['a.pdf']), failing(), 0);
    expect(storage.results.sent).toEqual([]);
    expect(storage.work.deleted).toEqual([]);
    expect(storage.poison.sent).toEqual([]);

    const last = await deliver(deps, renderBatch(0, ['a.pdf']), failing(), 2);
    expect(storage.results.sentJson()).toEqual([
      expect.objectContaining({
        type: 'batch-result',
        status: 'FAILED',
        attempt: 3,
        errorCode: 'PDF_CONVERSION_FAILED',
        errorDetails: { fileName: 'a.pdf' },
      }),
    ]);
    expect(storage.poison.sent).toHaveLength(1);
    expect(storage.work.deleted).toEqual([last.messageId]);
  });

  it('fails at once, without poison, on a permanent error', async () => {
    const { storage, deps, renderBatch } = setup();
    const message = renderBatch(0, ['a.pdf']);
    message.template.sha256 = 'f'.repeat(64);
    await deliver(deps, message);

    expect(storage.results.sentJson()).toEqual([
      expect.objectContaining({
        status: 'FAILED',
        errorCode: 'PDF_TEMPLATE_UNAVAILABLE',
      }),
    ]);
    expect(storage.poison.sent).toEqual([]);
    expect(storage.work.deleted).toHaveLength(1);
  });

  it('reports a missing batch input as an invalid message', async () => {
    const { storage, deps, renderBatch } = setup();
    const message = renderBatch(0, ['a.pdf']);
    storage.blobs.files.delete(message.inputBlob);
    await deliver(deps, message);
    expect(storage.results.sentJson()[0].errorCode).toBe('INVALID_MESSAGE');
  });

  it('sends a message seen more times than allowed straight to poison', async () => {
    const { storage, deps, renderBatch } = setup(3);
    const slot = fakeSlot();
    await deliver(deps, renderBatch(0, ['a.pdf']), slot, 3);
    expect(slot.calls).toEqual([]);
    expect(storage.results.sentJson()[0]).toMatchObject({
      status: 'FAILED',
      attempt: 4,
    });
    expect(storage.poison.sent).toHaveLength(1);
  });

  it('keeps an unreadable message for diagnosis without reporting', async () => {
    const { storage, deps } = setup();
    await deliver(deps, 'not json');
    expect(storage.results.sent).toEqual([]);
    expect(storage.poison.sent).toEqual(['not json']);
    expect(storage.work.deleted).toHaveLength(1);
  });

  it('still reports an invalid message that names its job', async () => {
    const { storage, deps, renderBatch } = setup();
    const unsafe = {
      ...renderBatch(4, ['a.pdf']),
      outputPrefix: 'pdf-jobs/../templates/',
    };
    await deliver(deps, unsafe);
    expect(storage.results.sentJson()).toEqual([
      expect.objectContaining({
        type: 'batch-result',
        jobId: JOB,
        batchIndex: 4,
        status: 'FAILED',
        errorCode: 'INVALID_MESSAGE',
      }),
    ]);
    expect(storage.poison.sent).toHaveLength(1);
    expect(storage.work.deleted).toHaveLength(1);
  });
});

describe('assemble-zip', () => {
  const zipMessage = (expectedFiles: number) => ({
    schemaVersion: 1,
    type: 'assemble-zip',
    jobId: JOB,
    sourcePrefix: `pdf-jobs/${JOB}/pdf/`,
    zipBlob: `pdf-jobs/${JOB}/result.zip`,
    expectedFiles,
  });

  // Entries go in code-unit order (digits, then upper case, then lower case),
  // the order a bare sort() always gave.
  it('zips every PDF keeping the folder of each one, in a stable order', async () => {
    const { storage, deps } = setup();
    for (const name of [
      'b/2026-0004.pdf',
      'Antes de 2022/2026-0001.pdf',
      'a/2026-0003.pdf',
      'Antes de 2022/2026-0010.pdf',
      '2022 en adelante/2026-0002.pdf',
    ]) {
      storage.blobs.files.set(`pdf-jobs/${JOB}/pdf/${name}`, FAKE_PDF);
    }
    await deliver(deps, zipMessage(5));

    const zip = new PizZip(
      storage.blobs.files.get(`pdf-jobs/${JOB}/result.zip`)!,
    );
    expect(
      Object.values(zip.files)
        .filter((entry) => !entry.dir)
        .map((entry) => entry.name),
    ).toEqual([
      '2022 en adelante/2026-0002.pdf',
      'Antes de 2022/2026-0001.pdf',
      'Antes de 2022/2026-0010.pdf',
      'a/2026-0003.pdf',
      'b/2026-0004.pdf',
    ]);
    const [result] = storage.results.sentJson();
    expect(result).toMatchObject({
      type: 'zip-result',
      jobId: JOB,
      status: 'DONE',
    });
    expect(result.sizeBytes).toBe(
      storage.blobs.files.get(`pdf-jobs/${JOB}/result.zip`)!.length,
    );
  });

  it('fails when a PDF of the job is missing', async () => {
    const { storage, deps } = setup();
    storage.blobs.files.set(`pdf-jobs/${JOB}/pdf/a.pdf`, FAKE_PDF);
    await deliver(deps, zipMessage(2));
    expect(storage.results.sentJson()).toEqual([
      expect.objectContaining({
        type: 'zip-result',
        status: 'FAILED',
        errorCode: 'BULK_ZIP_INCOMPLETE',
        errorDetails: { expected: 2, found: 1 },
      }),
    ]);
    expect(storage.blobs.files.has(`pdf-jobs/${JOB}/result.zip`)).toBe(false);
  });
});

describe('startWorker', () => {
  it('never asks the queue for more messages than free slots', async () => {
    const { storage, deps, renderBatch } = setup();
    deps.pool = createSlotPool([fakeSlot(), fakeSlot()]);
    for (let i = 0; i < 5; i++)
      storage.work.enqueue(renderBatch(i, [`${i}.pdf`]));

    const worker = startWorker(deps);
    await expect.poll(() => storage.results.sent.length).toBe(5);
    await worker.stop();

    expect(Math.max(...storage.work.receiveRequests)).toBeLessThanOrEqual(2);
    expect(storage.work.deleted).toHaveLength(5);
  });

  it('keeps running when reporting a result fails', async () => {
    const { storage, deps, renderBatch } = setup();
    storage.results.send = async () => {
      throw new JobError('PDF_STORAGE_UNAVAILABLE', 'down');
    };
    storage.work.enqueue(renderBatch(0, ['a.pdf']));
    const worker = startWorker(deps);
    await expect
      .poll(() => storage.work.receiveRequests.length)
      .toBeGreaterThan(1);
    await worker.stop();
    expect(storage.work.deleted).toEqual([]);
  });
});
