import { currentAdminSlug } from "../routes";
import type { PdfDocumentType } from "./pdfJobs";

// The last bulk job started or followed from this browser, per municipality
// and document type (a municipality runs one job at a time, but the ZIP of
// liquidations and the one of payment orders are offered on different
// screens). GET /pdf-jobs/active only returns a job while it runs, so this is
// what lets a screen offer its finished ZIP after the Administrator moved to
// another screen or reloaded the page. It is only an id: the job itself is
// always read from the backend.
//
// The key is built on every call from this tab's URL, like the HTTP client's
// routes (null outside a municipality, where there is no panel to restore).
function key(documentType: PdfDocumentType): string | null {
  const slug = currentAdminSlug();
  return slug ? `slomp.pdfJob.${slug}.${documentType}` : null;
}

// localStorage can throw (private mode, blocked storage); without it, the
// panel still follows the active job, it just can't bring back a finished one.
export function readLastPdfJobId(documentType: PdfDocumentType): string | null {
  try {
    const current = key(documentType);
    return current ? localStorage.getItem(current) : null;
  } catch {
    return null;
  }
}

export function rememberPdfJob(
  documentType: PdfDocumentType,
  jobId: string,
): void {
  try {
    const current = key(documentType);
    if (current) localStorage.setItem(current, jobId);
  } catch {
    // Ignored: see comment above.
  }
}

export function forgetPdfJob(
  documentType: PdfDocumentType,
  jobId: string,
): void {
  try {
    const current = key(documentType);
    // Another tab may already be following a newer job.
    if (current && localStorage.getItem(current) === jobId) {
      localStorage.removeItem(current);
    }
  } catch {
    // Ignored: see comment above.
  }
}
