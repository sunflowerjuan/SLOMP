import { ApiError, getErrorMessage } from "../../api/ApiError";
import type { PdfJob } from "../../api/pdfJobs";
import type { PdfJobState } from "../../hooks/usePdfJob";
import { Button } from "./Button";
import { Notice } from "./Notice";
import { Reveal } from "./Reveal";
import "./PdfJobProgress.css";

const COUNT_FORMATTER = new Intl.NumberFormat("es-CO");
const TIME_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  hour: "numeric",
  minute: "2-digit",
});

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
    { document: job.documentType },
  );
}

const EXPIRED_MESSAGE = getErrorMessage(
  new ApiError(410, "Bulk job expired", "BULK_JOB_EXPIRED"),
);

const IN_PROGRESS_MESSAGE = getErrorMessage(
  new ApiError(409, "Bulk job in progress", "BULK_GENERATION_IN_PROGRESS"),
);

interface PdfJobProgressProps {
  state: PdfJobState;
  // Heading while the job runs, e.g. "Generando mandamientos".
  runningTitle: string;
  // What the ready ZIP holds, e.g. "Liquidaciones actuales".
  readyLabel?: string | null;
}

// A bulk job as the panels show it (SL-121): progress while it runs, the
// ready ZIP with its expiry and download, what happened when it failed or
// expired, and a job of the other document type that holds the municipality.
// Lives inside a flex column whose gap is --reveal-gap.
export function PdfJobProgress({
  state,
  runningTitle,
  readyLabel,
}: PdfJobProgressProps) {
  const { job, active, ready, expired, failed, progress } = state;
  const showJob = active || ready;
  // While folding away, the block keeps its last look instead of emptying.
  const showsZip = job?.status === "DONE" || job?.status === "EXPIRED";

  return (
    <>
      {/* Stays mounted so it can fold away instead of vanishing: the page
          below would otherwise jump when a generation ends. */}
      <div
        className="ui-pdf-job__collapse"
        data-open={showJob}
        inert={!showJob}
      >
        <div className="ui-pdf-job__collapse-inner">
          {job && !showsZip && (
            <div className="ui-pdf-job__status" role="status">
              <strong>{runningTitle}</strong>
              <div
                className="ui-pdf-job__progress"
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
              {state.reconnecting ? (
                <p aria-live="off">
                  No se pudo actualizar el progreso. Reintentando…
                </p>
              ) : (
                job.status === "RUNNING" &&
                state.eta && <p aria-live="off">{state.eta}</p>
              )}
              <p>Puedes seguir trabajando mientras se genera.</p>
            </div>
          )}
          {job && showsZip && (
            <div className="ui-pdf-job__ready" role="status">
              <div>
                <strong>ZIP listo</strong>
                <span>
                  {[
                    readyLabel,
                    `${COUNT_FORMATTER.format(job.totalDocuments)} PDF`,
                    job.expiresAt && availableUntil(job.expiresAt),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <Button
                type="button"
                loading={state.downloading}
                onClick={() => void state.download(job)}
              >
                Descargar ZIP
              </Button>
            </div>
          )}
        </div>
      </div>
      {state.message && (
        <Reveal>
          <Notice
            variant={state.message.variant === "success" ? "success" : "error"}
          >
            {state.message.text}
          </Notice>
        </Reveal>
      )}
      {job && failed && (
        <Reveal>
          <Notice>{failureMessage(job)}</Notice>
        </Reveal>
      )}
      {expired && (
        <Reveal>
          <Notice variant="info">{EXPIRED_MESSAGE}</Notice>
        </Reveal>
      )}
      {state.otherJob && (
        <Reveal>
          <Notice variant="info">{IN_PROGRESS_MESSAGE}</Notice>
        </Reveal>
      )}
    </>
  );
}
