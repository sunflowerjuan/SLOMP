import { currentAdminSlug } from "../routes";

// The last bulk job started or followed from this browser, per municipality.
// GET /pdf-jobs/active only returns a job while it runs, so this is what lets
// the panel offer the finished ZIP after the Administrator moved to another
// screen or reloaded the page. It is only an id: the job itself is always read
// from the backend.
//
// The key is built on every call from this tab's URL, like the HTTP client's
// routes (null outside a municipality, where there is no panel to restore).
function key(): string | null {
  const slug = currentAdminSlug();
  return slug ? `slomp.pdfJob.${slug}` : null;
}

// localStorage can throw (private mode, blocked storage); without it, the
// panel still follows the active job, it just can't bring back a finished one.
export function readLastPdfJobId(): string | null {
  try {
    const current = key();
    return current ? localStorage.getItem(current) : null;
  } catch {
    return null;
  }
}

export function rememberPdfJob(jobId: string): void {
  try {
    const current = key();
    if (current) localStorage.setItem(current, jobId);
  } catch {
    // Ignored: see comment above.
  }
}

export function forgetPdfJob(jobId: string): void {
  try {
    const current = key();
    // Another tab may already be following a newer job.
    if (current && localStorage.getItem(current) === jobId) {
      localStorage.removeItem(current);
    }
  } catch {
    // Ignored: see comment above.
  }
}
