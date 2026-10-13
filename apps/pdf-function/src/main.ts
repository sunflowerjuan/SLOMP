import { loadConfig } from './config.ts';
import { JobError } from './errors.ts';
import { createHttpServer } from './http.ts';
import { minimalDocx } from './minimal-docx.ts';
import { createSlotPool } from './slots.ts';
import { createSofficeSlot, type Slot } from './soffice.ts';
import { connectAzureStorage } from './storage.ts';
import { createTemplateCache } from './templates.ts';
import { startWorker } from './worker.ts';

const config = loadConfig();

const createSlots = (count: number): Promise<Slot[]> =>
  Promise.all(
    Array.from({ length: count }, () =>
      createSofficeSlot(config.convertTimeoutMs),
    ),
  );

const storage = config.storageConnectionString
  ? await connectAzureStorage(config)
  : undefined;
const getTemplate = storage && createTemplateCache(storage.blobs);

// /render slots are warmed up now, so the first individual PDF doesn't pay
// LibreOffice's profile bootstrap (RNF-01: 5 s).
const renderSlots = await createSlots(config.renderSlots);
for (const [i, result] of (
  await Promise.all(renderSlots.map((slot) => slot.convert([minimalDocx()])))
).entries()) {
  if (result[0] instanceof JobError)
    console.log(`render slot ${i} warm-up failed: ${result[0].code}`);
}

async function legacyConvert(docx: Buffer): Promise<Buffer> {
  const slot = await createSofficeSlot(config.convertTimeoutMs);
  try {
    const [pdf] = await slot.convert([docx]);
    if (pdf instanceof JobError) throw pdf;
    return pdf!;
  } finally {
    await slot.dispose();
  }
}

const server = createHttpServer({
  serviceKey: config.serviceKey,
  renderPool: createSlotPool(renderSlots),
  getTemplate,
  legacyConvert,
  maxConcurrentConversions: config.maxConcurrentConversions,
}).listen(config.port, () =>
  console.log(`pdf service listening on ${config.port}`),
);

let workerSlots: Slot[] = [];
let worker: { stop(): Promise<void> } | undefined;
if (storage && getTemplate) {
  workerSlots = await createSlots(config.workerConcurrency);
  worker = startWorker({
    storage,
    pool: createSlotPool(workerSlots),
    getTemplate,
    visibilitySeconds: config.visibilitySeconds,
    maxAttempts: config.maxAttempts,
    pollIntervalMs: config.pollIntervalMs,
  });
  console.log(
    `queue consumer started on "${config.workQueue}" with ${workerSlots.length} slots`,
  );
} else {
  console.log(
    'AZURE_STORAGE_CONNECTION_STRING not set: queue consumer and /render disabled',
  );
}

// Finish in-flight batches before exiting; unfinished messages reappear in
// the queue for another instance anyway.
async function shutdown() {
  server.close();
  await worker?.stop();
  await Promise.all(
    [...renderSlots, ...workerSlots].map((slot) => slot.dispose()),
  );
  process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
