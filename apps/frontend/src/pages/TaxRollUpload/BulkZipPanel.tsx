import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getErrorMessage } from "../../api/ApiError";
import { messageForErrorCode } from "../../api/errorMessages";
import {
  downloadLiquidationsZip,
  getActiveLiquidationsZipJob,
  getLiquidationsZipJob,
  getPendingLiquidationCounts,
  startLiquidationsZip,
} from "../../api/resolutions";
import type {
  LiquidationKind,
  LiquidationsZipJob,
  PendingLiquidationCounts,
} from "../../api/resolutions";
import { Button } from "../../components/ui/Button";
import { triggerBrowserDownload } from "../../utils/downloadBlob";
import "./BulkZipPanel.css";

interface BulkZipPanelProps {
  refreshKey?: string | number;
}

const COUNT_FORMATTER = new Intl.NumberFormat("es-CO");

function formatRemaining(seconds: number): string {
  if (seconds < 60) return `Quedan unos ${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (seconds < 600) {
    const remainder = Math.round(seconds % 60);
    return `Quedan unos ${minutes} min${remainder ? ` ${remainder} s` : ""}`;
  }
  return `Quedan unos ${minutes} min`;
}

export function BulkZipPanel({ refreshKey }: BulkZipPanelProps) {
  const [counts, setCounts] = useState<PendingLiquidationCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState("");
  const [job, setJob] = useState<LiquidationsZipJob | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    kind: "info" | "success";
  } | null>(null);
  const [jobError, setJobError] = useState("");
  const [eta, setEta] = useState("");
  const [downloading, setDownloading] = useState(false);
  const emaRef = useRef<number | null>(null);
  const downloadedRef = useRef<string | null>(null);

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

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void loadCounts(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loadCounts, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    void getActiveLiquidationsZipJob(controller.signal)
      .then(({ job: activeJob }) => {
        if (activeJob?.status === "running") {
          setJob(activeJob);
          setJobId(activeJob.jobId);
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setJobError(getErrorMessage(caught));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    let active = true;
    let failures = 0;

    async function poll() {
      try {
        const nextJob = await getLiquidationsZipJob(jobId!, controller.signal);
        if (!active) return;
        failures = 0;
        setJob(nextJob);
        if (nextJob.status === "running") {
          timer = setTimeout(poll, 1000);
        } else {
          setJobId(null);
        }
      } catch (caught) {
        if (!active || controller.signal.aborted) return;
        // The job keeps running on the server: ride out a short network blip
        // before giving up on following it.
        failures += 1;
        if (failures < 4) {
          timer = setTimeout(poll, 2000);
          return;
        }
        setJobError(getErrorMessage(caught));
        setJobId(null);
      }
    }

    void poll();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  useEffect(() => {
    if (!job || job.status !== "running") return;
    const timer = setTimeout(() => {
      const elapsed = (Date.now() - new Date(job.startedAt).getTime()) / 1000;
      if (job.completed === 0 || elapsed < 3) {
        setEta("Calculando tiempo estimado…");
        return;
      }
      const rate = job.completed / elapsed;
      const estimate = Math.max(0, (job.total - job.completed) / rate);
      const previous = emaRef.current;
      const smoothed =
        previous === null ? estimate : previous * 0.7 + estimate * 0.3;
      emaRef.current = smoothed;
      setEta(formatRemaining(smoothed));
    }, 0);
    return () => clearTimeout(timer);
  }, [job]);

  useEffect(() => {
    if (!job || job.status === "running") return;
    if (job.status === "failed") {
      const timer = setTimeout(() => {
        setJobError(
          (job.errorCode &&
            messageForErrorCode(job.errorCode, job.errorDetails ?? {})) ||
            getErrorMessage(
              new ApiError(500, "Error", job.errorCode, job.errorDetails ?? {}),
            ),
        );
        void loadCounts();
      }, 0);
      return () => clearTimeout(timer);
    }
    if (downloadedRef.current === job.jobId) return;
    downloadedRef.current = job.jobId;
    const timer = setTimeout(() => {
      setDownloading(true);
      setEta("Descargando…");
      downloadLiquidationsZip(job.jobId)
        .then(({ blob, fileName }) => {
          triggerBrowserDownload(blob, fileName ?? "liquidaciones.zip");
          setNotice({
            text: "ZIP descargado. Revisa tu carpeta de descargas.",
            kind: "success",
          });
        })
        .catch((caught) => setJobError(getErrorMessage(caught)))
        .finally(() => {
          setDownloading(false);
          void loadCounts();
        });
    }, 0);
    return () => clearTimeout(timer);
  }, [job, loadCounts]);

  async function handleGenerate(kind: LiquidationKind) {
    setNotice(null);
    setJobError("");
    try {
      const { jobId: startedId } = await startLiquidationsZip(kind);
      setJob({
        jobId: startedId,
        kind,
        status: "running",
        total: 0,
        completed: 0,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        errorCode: null,
        errorDetails: null,
      });
      setJobId(startedId);
      emaRef.current = null;
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        caught.code === "NO_PENDING_LIQUIDATIONS"
      ) {
        setNotice({ text: getErrorMessage(caught), kind: "info" });
      } else {
        setJobError(getErrorMessage(caught));
      }
      void loadCounts();
    }
  }

  const progress = job?.total
    ? Math.min(100, Math.round((job.completed / job.total) * 100))
    : 0;
  const active = job?.status === "running" || downloading;

  return (
    <section
      className="bulk-zip-panel tax-roll-upload-page__card"
      aria-labelledby="bulk-zip-panel-title"
    >
      <h2
        className="tax-roll-upload-page__card-title"
        id="bulk-zip-panel-title"
      >
        Liquidaciones listas para generar
      </h2>
      {countsLoading && (
        <p className="bulk-zip-panel__muted" role="status">
          Cargando liquidaciones pendientes…
        </p>
      )}
      {!countsLoading && countsError && (
        <div className="bulk-zip-panel__notice" role="alert">
          {countsError}
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadCounts()}
          >
            Reintentar
          </Button>
        </div>
      )}
      {counts && (
        <div className="bulk-zip-panel__rows">
          {[
            {
              kind: "NORMAL" as const,
              label: "Liquidaciones actuales",
              count: counts.normal,
              aria: "Generar ZIP de liquidaciones actuales",
            },
            {
              kind: "PRESCRIPTION_RISK" as const,
              label: "Riesgo de prescripción",
              count: counts.prescriptionRisk,
              aria: "Generar ZIP de liquidaciones con riesgo de prescripción",
            },
          ].map((item) => (
            <div className="bulk-zip-panel__row" key={item.kind}>
              <div>
                <strong>{item.label}</strong>
                <span>
                  {item.count
                    ? `${COUNT_FORMATTER.format(item.count)} PDF`
                    : "Sin liquidaciones"}
                </span>
              </div>
              <Button
                type="button"
                disabled={!item.count || active}
                aria-label={item.aria}
                onClick={() => void handleGenerate(item.kind)}
              >
                Generar ZIP
              </Button>
            </div>
          ))}
        </div>
      )}
      {active && job && (
        <div
          className="bulk-zip-panel__status bulk-zip-panel__enter"
          role="status"
        >
          <strong>
            {job.kind === "NORMAL"
              ? "Generando liquidaciones actuales…"
              : "Generando liquidaciones con riesgo de prescripción…"}
          </strong>
          <div
            className="bulk-zip-panel__progress"
            role="progressbar"
            aria-label="Progreso de generación del ZIP"
            aria-valuemin={0}
            aria-valuemax={job.total || 1}
            aria-valuenow={job.completed}
          >
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
          <p className="bulk-zip-panel__live" aria-live="off">
            {job.completed} de {job.total} PDF · {progress}%
          </p>
          <p className="bulk-zip-panel__live" aria-live="off">
            {eta}
          </p>
        </div>
      )}
      {notice && (
        <div
          className={`bulk-zip-panel__notice bulk-zip-panel__notice--${notice.kind} bulk-zip-panel__enter`}
          role="status"
        >
          {notice.text}
        </div>
      )}
      {jobError && (
        <div
          className="bulk-zip-panel__notice bulk-zip-panel__enter"
          role="alert"
        >
          {jobError}
        </div>
      )}
    </section>
  );
}
