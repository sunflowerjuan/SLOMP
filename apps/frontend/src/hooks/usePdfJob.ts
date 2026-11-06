import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getErrorMessage } from "../api/ApiError";
import {
  forgetPdfJob,
  readLastPdfJobId,
  rememberPdfJob,
} from "../api/lastPdfJob";
import { downloadPdfJob, getActivePdfJob, getPdfJob } from "../api/pdfJobs";
import type {
  LiquidationKind,
  PdfDocumentType,
  PdfJob,
  StartedPdfJob,
} from "../api/pdfJobs";
import {
  estimateRemainingSeconds,
  isPdfJobActive,
  msUntilExpiry,
  pdfJobProgress,
} from "../domain/pdfJob";
import { triggerBrowserDownload } from "../utils/downloadBlob";

// The job's state is a primary-key read, so once a second keeps the bar
// moving without weighing on the backend.
const POLL_INTERVAL_MS = 1000;
// The job keeps running on the server whatever happens to this screen, so a
// failed read is retried (spacing out) instead of dropping the job.
const RETRY_DELAYS_MS = [2000, 4000, 8000, 15000];
// A job of another document type only blocks this screen's button: checking
// now and then is enough to know when it is free again.
const OTHER_JOB_POLL_MS = 5000;
// setTimeout's ceiling (about 24.8 days).
const MAX_TIMER_MS = 2_147_483_647;

const ZIP_FALLBACK_NAME: Record<PdfDocumentType, string> = {
  LIQUIDACION: "liquidaciones.zip",
  MANDAMIENTO: "mandamientos-de-pago.zip",
};

export interface PdfJobMessage {
  variant: "success" | "error";
  text: string;
}

function formatRemaining(seconds: number): string {
  if (seconds < 60) return `Quedan unos ${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (seconds < 600) {
    const remainder = Math.round(seconds % 60);
    return `Quedan unos ${minutes} min${remainder ? ` ${remainder} s` : ""}`;
  }
  return `Quedan unos ${minutes} min`;
}

// Follows the municipality's bulk job of one document type (SL-121): brings
// it back on arrival (the running one, or the last one this browser followed
// while its ZIP lasts), polls it while it runs, offers the ZIP until it
// expires and downloads it. The municipality runs one job at a time: a job of
// another type is not followed, only reported in `otherJob` until it ends.
export function usePdfJob(
  documentType: PdfDocumentType,
  onSettled?: (job: PdfJob) => void,
) {
  const [job, setJob] = useState<PdfJob | null>(null);
  const [otherJob, setOtherJob] = useState<PdfJob | null>(null);
  const [expiredJobId, setExpiredJobId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [eta, setEta] = useState("");
  const [message, setMessage] = useState<PdfJobMessage | null>(null);
  const etaRef = useRef<{ jobId: string; seconds: number } | null>(null);
  // The job started from this screen downloads itself when ready; one found
  // on arrival (reload, another tab) waits for the button.
  const autoDownloadRef = useRef<string | null>(null);
  const onSettledRef = useRef(onSettled);

  useEffect(() => {
    onSettledRef.current = onSettled;
  });

  const active = job !== null && isPdfJobActive(job);
  const expired =
    job !== null && (job.status === "EXPIRED" || expiredJobId === job.jobId);
  const ready = job !== null && job.status === "DONE" && !expired;
  const failed = job?.status === "FAILED";
  const progress = job ? pdfJobProgress(job) : 0;

  // Shows a running job: this screen's type is followed, another type only
  // blocks the button.
  const showRunning = useCallback(
    (running: PdfJob) => {
      if (running.documentType === documentType) {
        rememberPdfJob(documentType, running.jobId);
        setJob(running);
      } else {
        setOtherJob(running);
      }
    },
    [documentType],
  );

  const download = useCallback(
    async (target: PdfJob) => {
      setDownloading(true);
      setMessage(null);
      try {
        const { blob, fileName } = await downloadPdfJob(target.jobId);
        triggerBrowserDownload(
          blob,
          fileName ?? ZIP_FALLBACK_NAME[documentType],
        );
        setMessage({
          variant: "success",
          text: "ZIP descargado. Revisa tu carpeta de descargas.",
        });
      } catch (caught) {
        if (caught instanceof ApiError && caught.code === "BULK_JOB_EXPIRED") {
          setExpiredJobId(target.jobId);
        } else {
          setMessage({
            variant: "error",
            text: getErrorMessage(caught, { document: documentType }),
          });
        }
      } finally {
        setDownloading(false);
      }
    },
    [documentType],
  );

  const handleSettled = useCallback(
    (settled: PdfJob) => {
      onSettledRef.current?.(settled);
      if (autoDownloadRef.current !== settled.jobId) return;
      autoDownloadRef.current = null;
      if (settled.status === "DONE") void download(settled);
    },
    [download],
  );

  // On arrival: the running job if there is one (started here, in another tab
  // or by another Administrator); otherwise the last one of this type this
  // browser followed, whose ZIP may still be downloadable.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function restore() {
      const { job: running } = await getActivePdfJob(signal);
      if (running) {
        if (running.documentType === documentType) {
          rememberPdfJob(documentType, running.jobId);
          setJob((current) => current ?? running);
          return;
        }
        setOtherJob(running);
      }
      const lastId = readLastPdfJobId(documentType);
      if (!lastId) return;
      try {
        const last = await getPdfJob(lastId, signal);
        setJob((current) => current ?? last);
      } catch (caught) {
        // Gone or unreadable: nothing to bring back.
        if (
          caught instanceof ApiError &&
          (caught.status === 404 || caught.status === 400)
        ) {
          forgetPdfJob(documentType, lastId);
          return;
        }
        throw caught;
      }
    }

    restore().catch((caught) => {
      if (!signal.aborted) {
        setMessage({
          variant: "error",
          text: getErrorMessage(caught, { document: documentType }),
        });
      }
    });
    return () => controller.abort();
  }, [documentType]);

  // Follows the job while it runs. Leaving the screen stops only this
  // polling: the job goes on, and coming back picks it up again.
  const pollingId = active ? job.jobId : null;
  useEffect(() => {
    if (!pollingId) return;
    const jobId = pollingId;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    function tick() {
      // A hidden tab doesn't need a moving bar; it catches up when shown.
      if (document.hidden) {
        document.addEventListener("visibilitychange", tick, { once: true });
        return;
      }
      void poll();
    }

    async function poll() {
      try {
        const next = await getPdfJob(jobId, controller.signal);
        failures = 0;
        setReconnecting(false);
        setJob(next);
        if (isPdfJobActive(next)) {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        } else {
          handleSettled(next);
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (
          caught instanceof ApiError &&
          caught.code === "BULK_JOB_NOT_FOUND"
        ) {
          forgetPdfJob(documentType, jobId);
          setJob(null);
          setMessage({
            variant: "error",
            text: getErrorMessage(caught, { document: documentType }),
          });
          return;
        }
        setReconnecting(true);
        timer = setTimeout(
          tick,
          RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)],
        );
        failures += 1;
      }
    }

    tick();
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [pollingId, handleSettled, documentType]);

  // A job of another type frees the municipality when it ends; a failed read
  // just waits for the next check.
  const otherJobId =
    otherJob && isPdfJobActive(otherJob) ? otherJob.jobId : null;
  useEffect(() => {
    if (!otherJobId) return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      getPdfJob(otherJobId, controller.signal)
        .then((next) => {
          if (!isPdfJobActive(next)) setOtherJob(null);
        })
        .catch(() => undefined);
    }, OTHER_JOB_POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [otherJobId]);

  // Time left, smoothed so the estimate doesn't jump with each batch.
  useEffect(() => {
    if (!job || job.status !== "RUNNING") return;
    const timer = setTimeout(() => {
      const estimate = estimateRemainingSeconds(job, Date.now());
      if (estimate === null) {
        setEta("Calculando tiempo estimado…");
        return;
      }
      const previous =
        etaRef.current?.jobId === job.jobId ? etaRef.current.seconds : null;
      const seconds =
        previous === null ? estimate : previous * 0.7 + estimate * 0.3;
      etaRef.current = { jobId: job.jobId, seconds };
      setEta(formatRemaining(seconds));
    }, 0);
    return () => clearTimeout(timer);
  }, [job]);

  // The ZIP stops being offered the moment it expires, not at the backend's
  // next sweep.
  useEffect(() => {
    if (!job) return;
    const left = msUntilExpiry(job, Date.now());
    if (left === null) return;
    const timer = setTimeout(
      () => {
        setExpiredJobId(job.jobId);
        setMessage(null);
      },
      Math.min(left, MAX_TIMER_MS),
    );
    return () => clearTimeout(timer);
  }, [job]);

  // A failed or expired job has nothing left to offer after this visit.
  useEffect(() => {
    if (job && (job.status === "FAILED" || expired)) {
      forgetPdfJob(documentType, job.jobId);
    }
  }, [job, expired, documentType]);

  // Starts following a job this screen just created; it downloads itself when
  // ready.
  const follow = useCallback(
    (started: StartedPdfJob, kind: LiquidationKind | null = null) => {
      const now = new Date().toISOString();
      rememberPdfJob(documentType, started.jobId);
      autoDownloadRef.current = started.jobId;
      setOtherJob(null);
      setJob({
        jobId: started.jobId,
        documentType,
        kind,
        status: started.status,
        totalDocuments: started.totalDocuments,
        completedDocuments: 0,
        createdAt: now,
        startedAt: now,
        finishedAt: null,
        expiresAt: null,
        errorCode: null,
        errorDetails: null,
      });
    },
    [documentType],
  );

  // After a 409 BULK_GENERATION_IN_PROGRESS: shows the job that is running
  // (another tab, another Administrator or another document type).
  const adoptRunning = useCallback(() => {
    getActivePdfJob()
      .then(({ job: running }) => {
        if (running) showRunning(running);
      })
      .catch(() => undefined);
  }, [showRunning]);

  // Before a new attempt: a failed or expired job is done being reported; a
  // ZIP that can still be downloaded stays offered in case it doesn't start.
  const discardFinished = useCallback(() => {
    setMessage(null);
    setJob((current) =>
      current &&
      (current.status === "FAILED" ||
        current.status === "EXPIRED" ||
        current.jobId === expiredJobId)
        ? null
        : current,
    );
  }, [expiredJobId]);

  return {
    job,
    otherJob,
    active,
    ready,
    expired,
    failed,
    progress,
    eta,
    reconnecting,
    downloading,
    message,
    download,
    follow,
    adoptRunning,
    discardFinished,
  };
}

export type PdfJobState = ReturnType<typeof usePdfJob>;
