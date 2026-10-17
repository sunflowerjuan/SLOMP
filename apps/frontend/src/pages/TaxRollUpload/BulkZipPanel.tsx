import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getErrorMessage } from "../../api/ApiError";
import {
  forgetPdfJob,
  readLastPdfJobId,
  rememberPdfJob,
} from "../../api/lastPdfJob";
import {
  downloadPdfJob,
  getActivePdfJob,
  getPdfJob,
  getPendingLiquidationCounts,
  startLiquidationsJob,
} from "../../api/pdfJobs";
import type {
  LiquidationKind,
  PdfJob,
  PendingLiquidationCounts,
} from "../../api/pdfJobs";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Notice } from "../../components/ui/Notice";
import {
  estimateRemainingSeconds,
  incompleteDocuments,
  isPdfJobActive,
  msUntilExpiry,
  pdfJobProgress,
} from "../../domain/pdfJob";
import type { IncompleteDocument } from "../../domain/pdfJob";
import { triggerBrowserDownload } from "../../utils/downloadBlob";
import { IncompleteDocumentList } from "./IncompleteDocumentList";
import "./BulkZipPanel.css";

interface BulkZipPanelProps {
  refreshKey?: string | number;
}

const COUNT_FORMATTER = new Intl.NumberFormat("es-CO");
const TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  hour: "numeric",
  minute: "2-digit",
});

// The job's state is a primary-key read, so once a second keeps the bar
// moving without weighing on the backend.
const POLL_INTERVAL_MS = 1000;
// The job keeps running on the server whatever happens to this screen, so a
// failed read is retried (spacing out) instead of dropping the job.
const RETRY_DELAYS_MS = [2000, 4000, 8000, 15000];
// setTimeout's ceiling (about 24.8 days).
const MAX_TIMER_MS = 2_147_483_647;

const KIND_TEXT: Record<
  LiquidationKind,
  { label: string; running: string; generate: string }
> = {
  NORMAL: {
    label: "Liquidaciones actuales",
    running: "Generando liquidaciones actuales",
    generate: "Generar ZIP de liquidaciones actuales",
  },
  PRESCRIPTION_RISK: {
    label: "Riesgo de prescripción",
    running: "Generando liquidaciones con riesgo de prescripción",
    generate: "Generar ZIP de liquidaciones con riesgo de prescripción",
  },
};

const KINDS: LiquidationKind[] = ["NORMAL", "PRESCRIPTION_RISK"];

function formatRemaining(seconds: number): string {
  if (seconds < 60) return `Quedan unos ${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (seconds < 600) {
    const remainder = Math.round(seconds % 60);
    return `Quedan unos ${minutes} min${remainder ? ` ${remainder} s` : ""}`;
  }
  return `Quedan unos ${minutes} min`;
}

// "disponible hasta las 4:35 p. m." ("la 1:35", in Spanish).
function availableUntil(expiresAt: string): string {
  const date = new Date(expiresAt);
  const article = date.getHours() % 12 === 1 ? "la" : "las";
  return `disponible hasta ${article} ${TIME_FORMATTER.format(date)}`;
}

function phaseText(job: PdfJob, progress: number): string {
  if (job.status === "PREPARING") return "Preparando…";
  if (job.status === "ASSEMBLING") return "Armando el ZIP…";
  return `${COUNT_FORMATTER.format(job.completedDocuments)} de ${COUNT_FORMATTER.format(job.totalDocuments)} PDF · ${progress}%`;
}

// A FAILED job carries its cause in errorCode; same catalog as HTTP errors.
function failureMessage(job: PdfJob): string {
  return getErrorMessage(
    new ApiError(500, "Bulk job failed", job.errorCode, job.errorDetails ?? {}),
  );
}

const EXPIRED_MESSAGE = getErrorMessage(
  new ApiError(410, "Bulk job expired", "BULK_JOB_EXPIRED"),
);

interface PanelError {
  text: string;
  // Only for the 400 LIQUIDATION_DATA_INCOMPLETE of a new job.
  documents: IncompleteDocument[];
}

export function BulkZipPanel({ refreshKey }: BulkZipPanelProps) {
  const [counts, setCounts] = useState<PendingLiquidationCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState("");
  const [job, setJob] = useState<PdfJob | null>(null);
  const [expiredJobId, setExpiredJobId] = useState<string | null>(null);
  const [startingKind, setStartingKind] = useState<LiquidationKind | null>(
    null,
  );
  const [downloading, setDownloading] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [eta, setEta] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    kind: "info" | "success";
  } | null>(null);
  const [error, setError] = useState<PanelError | null>(null);
  const etaRef = useRef<{ jobId: string; seconds: number } | null>(null);
  // The job started from this screen downloads itself when ready; one found
  // on arrival (reload, another tab) waits for the button.
  const autoDownloadRef = useRef<string | null>(null);

  const active = job !== null && isPdfJobActive(job);
  const expired =
    job !== null && (job.status === "EXPIRED" || expiredJobId === job.jobId);
  const ready = job !== null && job.status === "DONE" && !expired;

  const loadCounts = useCallback(async (signal?: AbortSignal) => {
    setCountsLoading(true);
    setCountsError("");
    try {
      setCounts(await getPendingLiquidationCounts(signal));
    } catch (caught) {
      if (!signal?.aborted) setCountsError(getErrorMessage(caught));
    } finally {
      if (!signal?.aborted) setCountsLoading(false);
    }
  }, []);

  const download = useCallback(async (target: PdfJob) => {
    setDownloading(true);
    setNotice(null);
    setError(null);
    try {
      const { blob, fileName } = await downloadPdfJob(target.jobId);
      triggerBrowserDownload(blob, fileName ?? "liquidaciones.zip");
      setNotice({
        text: "ZIP descargado. Revisa tu carpeta de descargas.",
        kind: "success",
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "BULK_JOB_EXPIRED") {
        setExpiredJobId(target.jobId);
      } else {
        setError({ text: getErrorMessage(caught), documents: [] });
      }
    } finally {
      setDownloading(false);
    }
  }, []);

  const handleSettled = useCallback(
    (settled: PdfJob) => {
      void loadCounts();
      if (autoDownloadRef.current !== settled.jobId) return;
      autoDownloadRef.current = null;
      if (settled.status === "DONE") void download(settled);
    },
    [download, loadCounts],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void loadCounts(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loadCounts, refreshKey]);

  // On arrival: the running job if there is one (started here, in another tab
  // or by another Administrator); otherwise the last one this browser
  // followed, whose ZIP may still be downloadable.
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const show = (found: PdfJob) => setJob((current) => current ?? found);

    async function restore() {
      const { job: running } = await getActivePdfJob(signal);
      if (running) {
        rememberPdfJob(running.jobId);
        show(running);
        return;
      }
      const lastId = readLastPdfJobId();
      if (!lastId) return;
      try {
        show(await getPdfJob(lastId, signal));
      } catch (caught) {
        // Gone or unreadable: nothing to bring back.
        if (
          caught instanceof ApiError &&
          (caught.status === 404 || caught.status === 400)
        ) {
          forgetPdfJob(lastId);
          return;
        }
        throw caught;
      }
    }

    restore().catch((caught) => {
      if (!signal.aborted) {
        setError({ text: getErrorMessage(caught), documents: [] });
      }
    });
    return () => controller.abort();
  }, []);

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
          forgetPdfJob(jobId);
          setJob(null);
          setError({ text: getErrorMessage(caught), documents: [] });
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
  }, [pollingId, handleSettled]);

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
        setNotice(null);
      },
      Math.min(left, MAX_TIMER_MS),
    );
    return () => clearTimeout(timer);
  }, [job]);

  // A failed or expired job has nothing left to offer after this visit.
  useEffect(() => {
    if (job && (job.status === "FAILED" || expired)) forgetPdfJob(job.jobId);
  }, [job, expired]);

  async function handleGenerate(kind: LiquidationKind) {
    setNotice(null);
    setError(null);
    // A failed or expired job is done being reported; a ZIP that can still be
    // downloaded stays offered in case this attempt doesn't start.
    if (job && (job.status === "FAILED" || expired)) setJob(null);
    setStartingKind(kind);
    try {
      const started = await startLiquidationsJob(kind);
      const now = new Date().toISOString();
      rememberPdfJob(started.jobId);
      autoDownloadRef.current = started.jobId;
      setJob({
        jobId: started.jobId,
        documentType: "LIQUIDACION",
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
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : null;
      if (code === "NO_PENDING_LIQUIDATIONS") {
        setNotice({ text: getErrorMessage(caught), kind: "info" });
      } else if (code === "BULK_GENERATION_IN_PROGRESS") {
        // Started from another tab or by another Administrator: show it.
        setNotice({ text: getErrorMessage(caught), kind: "info" });
        getActivePdfJob()
          .then(({ job: running }) => {
            if (!running) return;
            rememberPdfJob(running.jobId);
            setJob(running);
          })
          .catch(() => undefined);
      } else {
        setError({
          text: getErrorMessage(caught),
          documents:
            caught instanceof ApiError
              ? incompleteDocuments(caught.details)
              : [],
        });
      }
      void loadCounts();
    } finally {
      setStartingKind(null);
    }
  }

  const busy = active || startingKind !== null || downloading;
  const progress = job ? pdfJobProgress(job) : 0;
  const showJob = active || ready;
  // While folding away, the block keeps its last look instead of emptying.
  const showsZip = job?.status === "DONE" || job?.status === "EXPIRED";

  return (
    <Card title="Liquidaciones listas para generar" className="bulk-zip-panel">
      {/* First load only: the placeholder rows keep the panel's height, so the
          real rows replace them without moving anything. */}
      {countsLoading && !counts && (
        <div
          className="bulk-zip-panel__rows"
          role="status"
          aria-label="Cargando liquidaciones pendientes"
        >
          {[0, 1].map((row) => (
            <div
              className="bulk-zip-panel__row bulk-zip-panel__row--skeleton"
              key={row}
              aria-hidden="true"
            >
              <div>
                <i />
                <i />
              </div>
              <b />
            </div>
          ))}
        </div>
      )}
      {!countsLoading && countsError && (
        <Notice className="bulk-zip-panel__retry">
          {countsError}
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadCounts()}
          >
            Reintentar
          </Button>
        </Notice>
      )}
      {counts && (
        <div className="bulk-zip-panel__rows bulk-zip-panel__enter">
          {KINDS.map((kind) => {
            const count =
              kind === "NORMAL" ? counts.normal : counts.prescriptionRisk;
            return (
              <div className="bulk-zip-panel__row" key={kind}>
                <div>
                  <strong>{KIND_TEXT[kind].label}</strong>
                  <span>
                    {count
                      ? `${COUNT_FORMATTER.format(count)} PDF`
                      : "Sin liquidaciones"}
                  </span>
                </div>
                <Button
                  type="button"
                  disabled={!count || busy}
                  loading={startingKind === kind}
                  aria-label={KIND_TEXT[kind].generate}
                  onClick={() => void handleGenerate(kind)}
                >
                  Generar ZIP
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {/* Stays mounted so it can fold away instead of vanishing: the page
          below would otherwise jump when a generation ends. */}
      <div
        className="bulk-zip-panel__collapse"
        data-open={showJob}
        inert={!showJob}
      >
        <div className="bulk-zip-panel__collapse-inner">
          {job && !showsZip && (
            <div className="bulk-zip-panel__status" role="status">
              <strong>
                {job.kind
                  ? KIND_TEXT[job.kind].running
                  : "Generando documentos"}
              </strong>
              <div
                className="bulk-zip-panel__progress"
                role="progressbar"
                aria-label="Progreso de la generación del ZIP"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-valuetext={phaseText(job, progress)}
              >
                <span style={{ transform: `scaleX(${progress / 100})` }} />
              </div>
              <p aria-live="off">{phaseText(job, progress)}</p>
              {reconnecting ? (
                <p aria-live="off">
                  No se pudo actualizar el progreso. Reintentando…
                </p>
              ) : (
                job.status === "RUNNING" && eta && <p aria-live="off">{eta}</p>
              )}
              <p>Puedes seguir trabajando mientras se genera.</p>
            </div>
          )}
          {job && showsZip && (
            <div className="bulk-zip-panel__ready" role="status">
              <div>
                <strong>ZIP listo</strong>
                <span>
                  {[
                    job.kind && KIND_TEXT[job.kind].label,
                    `${COUNT_FORMATTER.format(job.totalDocuments)} PDF`,
                    job.expiresAt && availableUntil(job.expiresAt),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <Button
                type="button"
                loading={downloading}
                onClick={() => void download(job)}
              >
                Descargar ZIP
              </Button>
            </div>
          )}
        </div>
      </div>
      {notice && (
        <div className="bulk-zip-panel__reveal">
          <Notice variant={notice.kind}>{notice.text}</Notice>
        </div>
      )}
      {job?.status === "FAILED" && (
        <div className="bulk-zip-panel__reveal">
          <Notice>{failureMessage(job)}</Notice>
        </div>
      )}
      {expired && (
        <div className="bulk-zip-panel__reveal">
          <Notice variant="info">{EXPIRED_MESSAGE}</Notice>
        </div>
      )}
      {error && (
        <div className="bulk-zip-panel__reveal">
          <div>
            <Notice>{error.text}</Notice>
            {error.documents.length > 0 && (
              <IncompleteDocumentList documents={error.documents} />
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
