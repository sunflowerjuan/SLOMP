import { request, requestBlob } from "./httpClient";
import type { BlobResponse } from "./httpClient";
import { municipalityPath } from "./municipality";

// Bulk PDF generation as an asynchronous job (SL-120; Confluence "Servicio de
// PDF: contrato entre backend y worker (SL-118)", sections 5 and 9). One
// active job per municipality; the ZIP can be downloaded again and again for
// one hour after it is ready.

export type PdfDocumentType = "LIQUIDACION" | "MANDAMIENTO";

export type LiquidationKind = "PRESCRIPTION_RISK" | "NORMAL";

export type PdfJobStatus =
  "PREPARING" | "RUNNING" | "ASSEMBLING" | "DONE" | "FAILED" | "EXPIRED";

export interface PendingLiquidationCounts {
  documentType: PdfDocumentType;
  prescriptionRisk: number;
  normal: number;
}

export interface StartedPdfJob {
  jobId: string;
  status: PdfJobStatus;
  totalDocuments: number;
}

export interface PdfJob {
  jobId: string;
  documentType: PdfDocumentType;
  // Only liquidations have a kind.
  kind: LiquidationKind | null;
  status: PdfJobStatus;
  totalDocuments: number;
  completedDocuments: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string | null;
  errorCode: string | null;
  errorDetails: Record<string, unknown> | null;
}

function jobPath(jobId: string, rest = ""): string {
  return municipalityPath(`/pdf-jobs/${encodeURIComponent(jobId)}${rest}`);
}

export function getPendingLiquidationCounts(
  signal?: AbortSignal,
): Promise<PendingLiquidationCounts> {
  return request(
    municipalityPath("/pdf-jobs/pending?documentType=LIQUIDACION"),
    {
      signal,
    },
  );
}

export function startLiquidationsJob(
  kind: LiquidationKind,
  signal?: AbortSignal,
): Promise<StartedPdfJob> {
  return request(municipalityPath("/pdf-jobs"), {
    method: "POST",
    body: { documentType: "LIQUIDACION", kind },
    signal,
  });
}

// The municipality's job in PREPARING, RUNNING or ASSEMBLING, if any.
export function getActivePdfJob(
  signal?: AbortSignal,
): Promise<{ job: PdfJob | null }> {
  return request(municipalityPath("/pdf-jobs/active"), { signal });
}

export function getPdfJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<PdfJob> {
  return request(jobPath(jobId), { signal });
}

// 409 BULK_JOB_NOT_READY before DONE, 410 BULK_JOB_EXPIRED after the hour.
export function downloadPdfJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<BlobResponse> {
  return requestBlob(jobPath(jobId, "/download"), { signal });
}
