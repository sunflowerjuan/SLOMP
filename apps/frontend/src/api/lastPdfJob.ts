import { ACTIVE_MUNICIPALITY_SLUG } from "./municipality";

// The last bulk job started or followed from this browser. GET
// /pdf-jobs/active only returns a job while it runs, so this is what lets the
// panel offer the finished ZIP after the Administrator moved to another screen
// or reloaded the page. It is only an id: the job itself is always read from
// the backend.
const KEY = `slomp.pdfJob.${ACTIVE_MUNICIPALITY_SLUG}`;

// localStorage can throw (private mode, blocked storage); without it, the
// panel still follows the active job, it just can't bring back a finished one.
export function readLastPdfJobId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function rememberPdfJob(jobId: string): void {
  try {
    localStorage.setItem(KEY, jobId);
  } catch {
    // Ignored: see comment above.
  }
}

export function forgetPdfJob(jobId: string): void {
  try {
    // Another tab may already be following a newer job.
    if (localStorage.getItem(KEY) === jobId) localStorage.removeItem(KEY);
  } catch {
    // Ignored: see comment above.
  }
}
