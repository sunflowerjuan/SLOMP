import { request, requestBlob } from "./httpClient";
import type { BlobResponse } from "./httpClient";

export type LiquidationKind = "PRESCRIPTION_RISK" | "NORMAL";

export interface PendingLiquidationCounts {
  prescriptionRisk: number;
  normal: number;
}

export interface LiquidationsZipJob {
  jobId: string;
  kind: LiquidationKind;
  status: "running" | "done" | "failed";
  total: number;
  completed: number;
  startedAt: string;
  finishedAt: string | null;
  errorCode: string | null;
  errorDetails: Record<string, unknown> | null;
}

export async function getPendingLiquidationCounts(
  signal?: AbortSignal,
): Promise<PendingLiquidationCounts> {
  return request("/resolutions/liquidations-zip/pending", { signal });
}

export async function startLiquidationsZip(
  kind: LiquidationKind,
  signal?: AbortSignal,
): Promise<{ jobId: string }> {
  return request("/resolutions/liquidations-zip", {
    method: "POST",
    body: { kind },
    signal,
  });
}

export async function getLiquidationsZipJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<LiquidationsZipJob> {
  return request(
    `/resolutions/liquidations-zip/jobs/${encodeURIComponent(jobId)}`,
    { signal },
  );
}

export async function getActiveLiquidationsZipJob(
  signal?: AbortSignal,
): Promise<{ job: LiquidationsZipJob | null }> {
  return request("/resolutions/liquidations-zip/jobs/active", { signal });
}

export function downloadLiquidationsZip(
  jobId: string,
  signal?: AbortSignal,
): Promise<BlobResponse> {
  return requestBlob(
    `/resolutions/liquidations-zip/jobs/${encodeURIComponent(jobId)}/download`,
    { signal },
  );
}
