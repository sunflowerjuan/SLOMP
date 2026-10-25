import { once } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import archiver from 'archiver';
import {
  parseBatchInput,
  parseWorkMessage,
  type AssembleZipMessage,
  type BatchResult,
  type RenderBatchMessage,
  type WorkMessage,
  type ZipResult,
} from './contract.ts';
import { JobError } from './errors.ts';
import { renderDocx } from './render.ts';
import type { SlotPool } from './slots.ts';
import type { Slot } from './soffice.ts';
import type { QueueMessage, Storage } from './storage.ts';
import type { GetTemplate } from './templates.ts';

export interface WorkerDeps {
  storage: Storage;
  pool: SlotPool<Slot>;
  getTemplate: GetTemplate;
  visibilitySeconds: number;
  maxAttempts: number;
  pollIntervalMs: number;
  log?: (message: string) => void;
}

// Any non-JobError here comes from Storage (network, throttling): retryable.
function asJobError(error: unknown): JobError {
  return error instanceof JobError
    ? error
    : new JobError(
        'PDF_STORAGE_UNAVAILABLE',
        'Storage operation failed.',
        undefined,
        {
          cause: error,
        },
      );
}

async function renderBatch(
  deps: WorkerDeps,
  message: RenderBatchMessage,
  slot: Slot,
  attempt: number,
): Promise<BatchResult> {
  const { blobs } = deps.storage;
  const raw = await blobs.download(message.inputBlob);
  if (!raw) {
    throw new JobError('INVALID_MESSAGE', 'Batch input not found.', {
      inputBlob: message.inputBlob,
    });
  }
  let json: unknown;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new JobError('INVALID_MESSAGE', 'Batch input is not valid JSON.', {
      inputBlob: message.inputBlob,
    });
  }
  const { documents } = parseBatchInput(json);
  const template = await deps.getTemplate(message.template);

  const docx = documents.map(({ fileName, data }) => {
    try {
      return renderDocx(template, data);
    } catch (error) {
      const jobError = asJobError(error);
      throw new JobError(
        jobError.code,
        jobError.message,
        { fileName },
        { cause: error },
      );
    }
  });

  const pdfs = await slot.convert(docx);
  // A document LibreOffice skipped inside the batch gets one solo retry.
  for (let i = 0; i < pdfs.length; i++) {
    if (pdfs[i] instanceof JobError) [pdfs[i]] = await slot.convert([docx[i]!]);
  }
  const failed = pdfs.findIndex((pdf) => pdf instanceof JobError);
  if (failed !== -1) {
    const error = pdfs[failed] as JobError;
    throw new JobError(error.code, error.message, {
      fileName: documents[failed]!.fileName,
    });
  }

  // Fixed output names (the resolution number), so a retried batch just
  // overwrites the same blobs.
  await Promise.all(
    documents.map(({ fileName }, i) =>
      blobs.upload(
        message.outputPrefix + fileName,
        pdfs[i] as Buffer,
        'application/pdf',
      ),
    ),
  );
  return {
    schemaVersion: 1,
    type: 'batch-result',
    jobId: message.jobId,
    batchIndex: message.batchIndex,
    status: 'DONE',
    documentCount: documents.length,
    attempt,
  };
}

async function assembleZip(
  deps: WorkerDeps,
  message: AssembleZipMessage,
): Promise<ZipResult> {
  const { blobs } = deps.storage;
  // Code-unit order, the same as a bare sort(), so the ZIP keeps its layout.
  const files = (await blobs.list(message.sourcePrefix)).sort(
    (a, b) => Number(a > b) - Number(a < b),
  );
  if (files.length !== message.expectedFiles) {
    throw new JobError(
      'BULK_ZIP_INCOMPLETE',
      'Not every PDF of the job is present.',
      {
        expected: message.expectedFiles,
        found: files.length,
      },
    );
  }

  // Streamed straight to Blob, one source PDF open at a time, so a 10,000
  // document job never sits in memory. PDFs are already compressed: store only.
  const archive = archiver('zip', { store: true });
  const uploaded = blobs.uploadStream(
    message.zipBlob,
    archive,
    'application/zip',
  );
  const appended = (async () => {
    for (const path of files) {
      archive.append(await blobs.openRead(path), {
        name: path.slice(message.sourcePrefix.length),
      });
      await once(archive, 'entry');
    }
    await archive.finalize();
  })();
  try {
    // An upload failure stalls the archive (backpressure), so wait on both.
    await Promise.race([appended, uploaded]);
    await Promise.all([appended, uploaded]);
  } catch (error) {
    archive.abort();
    appended.catch(() => {});
    uploaded.catch(() => {});
    throw error;
  }
  return {
    schemaVersion: 1,
    type: 'zip-result',
    jobId: message.jobId,
    status: 'DONE',
    sizeBytes: archive.pointer(),
  };
}

// Just enough of a message to address a FAILED result to its job.
type ReportTarget =
  | { type: 'render-batch'; jobId: string; batchIndex: number }
  | { type: 'assemble-zip'; jobId: string };

// A message that failed validation can still name its job; reporting it
// lets the backend revert right away instead of waiting for its watchdog.
function reportTarget(raw: unknown): ReportTarget | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { type, jobId, batchIndex } = raw as Record<string, unknown>;
  if (typeof jobId !== 'string' || jobId === '') return undefined;
  if (type === 'assemble-zip') return { type, jobId };
  if (type === 'render-batch' && Number.isInteger(batchIndex)) {
    return { type, jobId, batchIndex: batchIndex as number };
  }
  return undefined;
}

function failure(
  message: ReportTarget,
  error: JobError,
  attempt: number,
): BatchResult | ZipResult {
  const errorDetails = error.details;
  return message.type === 'render-batch'
    ? {
        schemaVersion: 1,
        type: 'batch-result',
        jobId: message.jobId,
        batchIndex: message.batchIndex,
        status: 'FAILED',
        attempt,
        errorCode: error.code,
        ...(errorDetails && { errorDetails }),
      }
    : {
        schemaVersion: 1,
        type: 'zip-result',
        jobId: message.jobId,
        status: 'FAILED',
        errorCode: error.code,
        ...(errorDetails && { errorDetails }),
      };
}

export async function handleMessage(
  deps: WorkerDeps,
  queued: QueueMessage,
  slot: Slot,
): Promise<void> {
  const { work, results, poison } = deps.storage;
  const log = deps.log ?? console.log;
  const attempt = queued.dequeueCount;

  let raw: unknown;
  let message: WorkMessage;
  try {
    raw = JSON.parse(queued.text);
    message = parseWorkMessage(raw);
  } catch (error) {
    // Kept in poison for diagnosis; reported when the job can be told.
    log(`invalid message ${queued.messageId}: ${(error as Error).message}`);
    const target = reportTarget(raw);
    if (target) {
      const jobError = asJobError(error);
      await results.send(JSON.stringify(failure(target, jobError, attempt)));
    }
    await poison.send(queued.text);
    await work.delete(queued);
    return;
  }

  const publishFailure = async (error: JobError, toPoison: boolean) => {
    log(
      `job ${message.jobId} ${message.type} failed (attempt ${attempt}): ${error.code}`,
    );
    await results.send(JSON.stringify(failure(message, error, attempt)));
    if (toPoison) await poison.send(queued.text);
    await work.delete(queued);
  };

  // Seen more times than allowed: the worker died while processing it.
  if (attempt > deps.maxAttempts) {
    await publishFailure(
      new JobError('PDF_CONVERSION_FAILED', 'Attempts exhausted.', {
        attempts: attempt,
      }),
      true,
    );
    return;
  }

  let result: BatchResult | ZipResult;
  try {
    result =
      message.type === 'render-batch'
        ? await renderBatch(deps, message, slot, attempt)
        : await assembleZip(deps, message);
  } catch (error) {
    const jobError = asJobError(error);
    if (jobError.permanent || attempt >= deps.maxAttempts) {
      await publishFailure(jobError, !jobError.permanent);
    } else {
      // Left in the queue: it reappears after the visibility timeout.
      log(
        `job ${message.jobId} ${message.type} attempt ${attempt} will retry: ${jobError.code}`,
      );
    }
    return;
  }
  await results.send(JSON.stringify(result));
  await work.delete(queued);
}

export function startWorker(deps: WorkerDeps): { stop(): Promise<void> } {
  const log = deps.log ?? console.log;
  const inFlight = new Set<Promise<void>>();
  let running = true;

  const loop = async () => {
    while (running) {
      const free = deps.pool.free();
      if (free === 0) {
        await Promise.race(inFlight);
        continue;
      }
      let messages: QueueMessage[];
      try {
        messages = await deps.storage.work.receive(
          free,
          deps.visibilitySeconds,
        );
      } catch (error) {
        log(`receive failed: ${(error as Error).message}`);
        messages = [];
      }
      if (messages.length === 0) {
        await sleep(deps.pollIntervalMs);
        continue;
      }
      for (const queued of messages) {
        const slot = deps.pool.tryAcquire()!;
        const task: Promise<void> = handleMessage(deps, queued, slot)
          // Storage failing while reporting: the message reappears later.
          .catch((error) =>
            log(`message ${queued.messageId}: ${(error as Error).message}`),
          )
          .finally(() => {
            deps.pool.release(slot);
            inFlight.delete(task);
          });
        inFlight.add(task);
      }
    }
  };
  const done = loop();

  return {
    async stop() {
      running = false;
      await done;
      await Promise.allSettled(inFlight);
    },
  };
}
