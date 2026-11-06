import type { PdfJob, PdfJobStatus } from "../api/pdfJobs";

// How the panel reads a bulk PDF job (SL-121). Pure: no requests and no
// clock, `now` comes from the caller.

const ACTIVE_STATUSES: PdfJobStatus[] = ["PREPARING", "RUNNING", "ASSEMBLING"];

export function isPdfJobActive(job: Pick<PdfJob, "status">): boolean {
  return ACTIVE_STATUSES.includes(job.status);
}

// 0 to 100, rounded down so the bar only fills when every PDF is done. The
// ZIP is assembled after the last PDF, so ASSEMBLING already shows it full.
// Batches can finish while the job is still PREPARING, so those count too.
export function pdfJobProgress(
  job: Pick<PdfJob, "status" | "completedDocuments" | "totalDocuments">,
): number {
  if (job.status === "ASSEMBLING" || job.status === "DONE") return 100;
  if (!isPdfJobActive(job) || job.totalDocuments <= 0) return 0;
  return Math.min(
    100,
    Math.floor((job.completedDocuments / job.totalDocuments) * 100),
  );
}

// Milliseconds the ZIP of a DONE job has left (0 once it is past), or null
// when there is no ZIP to count down. The backend only sweeps expired jobs
// every 5 minutes, but the download answers 410 as soon as expiresAt passes.
export function msUntilExpiry(
  job: Pick<PdfJob, "status" | "expiresAt">,
  now: number,
): number | null {
  if (job.status !== "DONE" || job.expiresAt === null) return null;
  return Math.max(0, Date.parse(job.expiresAt) - now);
}

// Seconds left at the pace so far; null while there is too little to tell.
export function estimateRemainingSeconds(
  job: Pick<
    PdfJob,
    | "status"
    | "completedDocuments"
    | "totalDocuments"
    | "startedAt"
    | "createdAt"
  >,
  now: number,
): number | null {
  if (job.status !== "RUNNING" || job.completedDocuments === 0) return null;
  const elapsed = (now - Date.parse(job.startedAt ?? job.createdAt)) / 1000;
  if (!(elapsed >= 3)) return null;
  const rate = job.completedDocuments / elapsed;
  return Math.max(0, (job.totalDocuments - job.completedDocuments) / rate);
}

export interface IncompleteDocument {
  cadastralCode: string;
  periods: number[];
  // MISSING_LIQUIDATION_FIELD keys, e.g. "PROPERTY_ADDRESS".
  missing: string[];
}

// details.documents of the bulk LIQUIDATION_DATA_INCOMPLETE (400): every
// liquidation that keeps the job from starting, so they can all be fixed at
// once.
export function incompleteDocuments(
  details: Record<string, unknown>,
): IncompleteDocument[] {
  if (!Array.isArray(details.documents)) return [];
  return details.documents.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { cadastralCode, periods, missing } = entry as Record<
      string,
      unknown
    >;
    return [
      {
        cadastralCode: typeof cadastralCode === "string" ? cadastralCode : "",
        periods: Array.isArray(periods)
          ? periods
              .filter((period): period is number => Number.isInteger(period))
              .sort((a, b) => a - b)
          : [],
        missing: Array.isArray(missing)
          ? missing.filter((key): key is string => typeof key === "string")
          : [],
      },
    ];
  });
}
