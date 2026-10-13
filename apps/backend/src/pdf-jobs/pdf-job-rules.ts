import { PdfJobStatus, ResolutionKind } from '@prisma/client';
import type { PdfResult } from 'shared/pdf-contract';
import { PRESCRIPTION_YEARS } from '../tax-roll/period-rules.js';

// Rules of the bulk PDF job (Confluence "Servicio de PDF: contrato entre
// backend y worker (SL-118)", sections 5, 6 and 8). Pure: no Prisma, no
// Storage, no clock.

// A municipality has at most one job in these states (partial unique index
// pdf_jobs_one_active_per_municipality).
export const ACTIVE_JOB_STATUSES: PdfJobStatus[] = [
  PdfJobStatus.PREPARING,
  PdfJobStatus.RUNNING,
  PdfJobStatus.ASSEMBLING,
];

// Batch results still count while the job is PREPARING: the worker can finish
// the first batches before the backend has enqueued the last one.
export const BATCH_PHASE_STATUSES: PdfJobStatus[] = [
  PdfJobStatus.PREPARING,
  PdfJobStatus.RUNNING,
];

export function splitIntoBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    batches.push(items.slice(i, i + size));
  return batches;
}

// The ZIP folder of each kind; the cutoff year is a business rule, so the
// backend names the files and the PDF service just writes them.
export function bulkFolder(kind: ResolutionKind, currentYear: number): string {
  const cutoff = currentYear - PRESCRIPTION_YEARS + 1;
  return kind === ResolutionKind.PRESCRIPTION_RISK
    ? `Liquidaciones antes de ${cutoff}`
    : `Liquidaciones ${cutoff} en adelante`;
}

export function bulkZipFileName(kind: ResolutionKind | null): string {
  return kind === ResolutionKind.PRESCRIPTION_RISK
    ? 'liquidaciones-riesgo-prescripcion.zip'
    : 'liquidaciones-cobro-normal.zip';
}

// Value the counter goes back to when a failed job returns its range, or null
// when someone else took numbers after the job (should not happen: both take
// the counter lock), in which case the counter is left alone.
export function counterAfterRevert(
  counter: number,
  firstSequence: number,
  lastSequence: number,
): number | null {
  return counter === lastSequence ? firstSequence - 1 : null;
}

export function minutesBefore(now: Date, minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

export function minutesAfter(now: Date, minutes: number): Date {
  return new Date(now.getTime() + minutes * 60_000);
}

// pdf-results messages come from our own PDF service; this only rejects text
// that isn't a result at all, so a malformed message is dropped instead of
// coming back forever.
export function parsePdfResult(text: string): PdfResult | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const result = value as Partial<PdfResult> & { batchIndex?: unknown };
  const knownType =
    (result.type === 'batch-result' && Number.isInteger(result.batchIndex)) ||
    result.type === 'zip-result';
  const knownStatus = result.status === 'DONE' || result.status === 'FAILED';
  return result.schemaVersion === 1 &&
    knownType &&
    knownStatus &&
    typeof result.jobId === 'string'
    ? (result as PdfResult)
    : null;
}
