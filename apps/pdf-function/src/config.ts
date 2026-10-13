import { availableParallelism } from 'node:os';

function positiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= 1 ? value : fallback;
}

export interface Config {
  port: number;
  serviceKey: string;
  storageConnectionString: string | undefined;
  workQueue: string;
  resultsQueue: string;
  poisonQueue: string;
  jobsContainer: string;
  templatesContainer: string;
  workerConcurrency: number;
  renderSlots: number;
  visibilitySeconds: number;
  maxAttempts: number;
  pollIntervalMs: number;
  convertTimeoutMs: number;
  maxConcurrentConversions: number;
}

export function loadConfig(): Config {
  const serviceKey = process.env.PDF_SERVICE_KEY;
  if (!serviceKey) {
    throw new Error(
      'PDF_SERVICE_KEY is required (shared secret for POST /render).',
    );
  }
  return {
    port: positiveInt('PORT', 3001),
    serviceKey,
    storageConnectionString:
      process.env.AZURE_STORAGE_CONNECTION_STRING || undefined,
    workQueue: process.env.PDF_WORK_QUEUE ?? 'pdf-work',
    resultsQueue: process.env.PDF_RESULTS_QUEUE ?? 'pdf-results',
    poisonQueue: process.env.PDF_POISON_QUEUE ?? 'pdf-work-poison',
    jobsContainer: process.env.PDF_JOBS_CONTAINER ?? 'pdf-jobs',
    templatesContainer: process.env.TEMPLATES_CONTAINER ?? 'templates',
    workerConcurrency: positiveInt(
      'WORKER_CONCURRENCY',
      Math.max(1, availableParallelism() - 1),
    ),
    renderSlots: positiveInt('RENDER_SLOTS', 1),
    visibilitySeconds: positiveInt('QUEUE_VISIBILITY_SECONDS', 300),
    maxAttempts: positiveInt('MAX_ATTEMPTS', 3),
    pollIntervalMs: positiveInt('POLL_INTERVAL_MS', 2000),
    convertTimeoutMs: positiveInt('CONVERT_TIMEOUT_MS', 25_000),
    maxConcurrentConversions: positiveInt('MAX_CONCURRENT_CONVERSIONS', 2),
  };
}
