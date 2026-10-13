// Local end-to-end check against Azurite and the running service (it plays
// the backend's part of the contract):
//   docker compose up -d azurite pdf
//   AZURE_STORAGE_CONNECTION_STRING=... pnpm --filter pdf-function demo [documents]
// The connection string uses 127.0.0.1 endpoints (this runs on the host).
// Uploads the template, runs a bulk job, times POST /render while the job
// runs (RNF-01: under 5 s) and checks the resulting ZIP.
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BlobServiceClient } from '@azure/storage-blob';
import { QueueServiceClient } from '@azure/storage-queue';
import PizZip from 'pizzip';

const connection = process.env.AZURE_STORAGE_CONNECTION_STRING;
if (!connection) throw new Error('Set AZURE_STORAGE_CONNECTION_STRING.');
const serviceUrl = process.env.PDF_SERVICE_URL ?? 'http://localhost:3001';
const serviceKey =
  process.env.PDF_SERVICE_KEY ?? 'local-compose-only-change-me';
const templatePath =
  process.env.TEMPLATE_PATH ?? '../backend/templates/liquidacion-paez.docx';
const total = Number(process.argv[2] ?? 100);
const BATCH = 10;

const blobs = BlobServiceClient.fromConnectionString(connection);
const queues = QueueServiceClient.fromConnectionString(connection);
const work = queues.getQueueClient('pdf-work');
const results = queues.getQueueClient('pdf-results');
const upload = (path: string, data: Buffer) => {
  const [container, ...name] = path.split('/');
  return blobs
    .getContainerClient(container!)
    .getBlockBlobClient(name.join('/'))
    .uploadData(data);
};

const template = await readFile(templatePath);
const ref = {
  blob: 'templates/paez/liquidacion/1.docx',
  sha256: createHash('sha256').update(template).digest('hex'),
};
await upload(ref.blob, template);

const data = (n: number) => ({
  resolutionNumber: `2026-${String(n).padStart(4, '0')}`,
  cadastralCode: `15514000100000${String(n).padStart(16, '0')}`,
  propertyName: 'LA ESPERANZA',
  owners: 'JUAN PEREZ',
  startYear: '2022',
  endYear: '2026',
  totalAmount: '$ 540.000',
  capitalAmount: '$ 450.000',
  interestAmount: '$ 90.000',
  rows: [
    {
      year: '2022',
      concept: 'Impuesto predial',
      interest: '$ 10.000',
      capital: '$ 50.000',
    },
  ],
});
const folder = (n: number) =>
  n % 2 ? 'Liquidaciones antes de 2022' : 'Liquidaciones 2022 en adelante';

const jobId = randomUUID();
const batches = Math.ceil(total / BATCH);
for (let b = 0; b < batches; b++) {
  const numbers = Array.from(
    { length: Math.min(BATCH, total - b * BATCH) },
    (_, i) => b * BATCH + i + 1,
  );
  const inputBlob = `pdf-jobs/${jobId}/input/batch-${String(b).padStart(3, '0')}.json`;
  const documents = numbers.map((n) => ({
    fileName: `${folder(n)}/${data(n).resolutionNumber}.pdf`,
    data: data(n),
  }));
  await upload(inputBlob, Buffer.from(JSON.stringify({ documents })));
  await work.sendMessage(
    JSON.stringify({
      schemaVersion: 1,
      type: 'render-batch',
      jobId,
      municipalityId: 1,
      documentType: 'LIQUIDACION',
      batchIndex: b,
      inputBlob,
      template: ref,
      outputPrefix: `pdf-jobs/${jobId}/pdf/`,
    }),
  );
}
console.log(`job ${jobId}: ${total} documents in ${batches} batches queued`);
const started = Date.now();

// Individual PDFs while the bulk job runs.
const renderTimes: number[] = [];
for (let i = 0; i < 5; i++) {
  const t0 = Date.now();
  const response = await fetch(`${serviceUrl}/render`, {
    method: 'POST',
    headers: { 'X-Internal-Key': serviceKey },
    body: JSON.stringify({
      schemaVersion: 1,
      documentType: 'LIQUIDACION',
      template: ref,
      data: data(9000 + i),
    }),
  });
  const pdf = Buffer.from(await response.arrayBuffer());
  if (
    response.status !== 200 ||
    !pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))
  ) {
    throw new Error(
      `/render answered ${response.status}: ${pdf.toString().slice(0, 200)}`,
    );
  }
  renderTimes.push(Date.now() - t0);
}
console.log(`/render during the bulk job: ${renderTimes.join(' ms, ')} ms`);

async function waitFor(type: string, count: number) {
  const seen: Record<string, unknown>[] = [];
  while (seen.length < count) {
    const { receivedMessageItems } = await results.receiveMessages({
      numberOfMessages: 32,
      visibilityTimeout: 30,
    });
    if (!receivedMessageItems.length)
      await new Promise((r) => setTimeout(r, 500));
    for (const item of receivedMessageItems) {
      const result = JSON.parse(item.messageText);
      if (result.jobId !== jobId || result.type !== type) continue;
      await results.deleteMessage(item.messageId, item.popReceipt);
      if (result.status !== 'DONE')
        throw new Error(`failed: ${item.messageText}`);
      seen.push(result);
    }
  }
  return seen;
}

await waitFor('batch-result', batches);
const rendered = Date.now() - started;
await work.sendMessage(
  JSON.stringify({
    schemaVersion: 1,
    type: 'assemble-zip',
    jobId,
    sourcePrefix: `pdf-jobs/${jobId}/pdf/`,
    zipBlob: `pdf-jobs/${jobId}/result.zip`,
    expectedFiles: total,
  }),
);
const [zipResult] = await waitFor('zip-result', 1);
const zip = new PizZip(
  await blobs
    .getContainerClient('pdf-jobs')
    .getBlockBlobClient(`${jobId}/result.zip`)
    .downloadToBuffer(),
);
const entries = Object.values(zip.files).filter((entry) => !entry.dir);
const folders = new Set(entries.map((entry) => entry.name.split('/')[0]));
console.log(
  `batches done in ${(rendered / 1000).toFixed(1)} s (${(total / (rendered / 1000)).toFixed(1)} PDF/s); ` +
    `ZIP ${zipResult!.sizeBytes} bytes, ${entries.length} PDFs in ${[...folders].join(' | ')}`,
);
if (entries.length !== total) throw new Error('ZIP does not have every PDF');
if (Math.max(...renderTimes) >= 5000)
  throw new Error('/render took 5 s or more');
console.log('OK');
