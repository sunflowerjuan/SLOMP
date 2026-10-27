import type { IncompleteDocument } from "../../domain/pdfJob";
import type { PdfJobState } from "../../hooks/usePdfJob";
import { Button } from "./Button";
import { Card } from "./Card";
import { IncompleteDocumentList } from "./IncompleteDocumentList";
import { Notice } from "./Notice";
import { PdfJobProgress } from "./PdfJobProgress";
import { Reveal } from "./Reveal";
import "./ZipJobPanel.css";

const COUNT_FORMATTER = new Intl.NumberFormat("es-CO");

export interface ZipJobRow {
  id: string;
  label: string;
  // PDFs its ZIP would hold.
  count: number;
  // Shown instead of the count when there is nothing to generate; without it
  // the row only has its label.
  emptyText?: string;
  // Accessible name of the row's "Generar ZIP" button.
  actionLabel: string;
  // Its job is being started: every row waits.
  starting?: boolean;
  onGenerate: () => void;
}

// For counts the panel's owner fetches: placeholder rows on the first load,
// and the cause with "Reintentar" when they fail.
export interface ZipJobCountsRequest {
  loading: boolean;
  // Announces the placeholder rows, e.g. "Cargando liquidaciones pendientes".
  loadingLabel: string;
  placeholderRows: number;
  error: string;
  onRetry: () => void;
}

export interface ZipJobNotice {
  variant: "info" | "error";
  text: string;
  // Only for the 400 LIQUIDATION_DATA_INCOMPLETE of a new job.
  documents: IncompleteDocument[];
}

interface ZipJobPanelProps {
  title: string;
  // null while the counts aren't known.
  rows: ZipJobRow[] | null;
  countsRequest?: ZipJobCountsRequest;
  // No row can start, e.g. while a single document is being issued.
  locked?: boolean;
  job: PdfJobState;
  // Heading while the job runs, e.g. "Generando mandamientos".
  runningTitle: string;
  // What the ready ZIP holds.
  readyLabel?: string | null;
  notice: ZipJobNotice | null;
  // Names the documents of a LIQUIDATION_DATA_INCOMPLETE notice.
  incompleteLabel: string;
}

// The bulk ZIP of one screen (liquidations, payment orders): a row per kind
// of document with its count and button, the job's progress and ready ZIP,
// and what kept a job from starting. Knows nothing of where the counts come
// from or how a job starts.
export function ZipJobPanel({
  title,
  rows,
  countsRequest,
  locked = false,
  job,
  runningTitle,
  readyLabel,
  notice,
  incompleteLabel,
}: ZipJobPanelProps) {
  // The municipality runs one bulk job at a time.
  const busy =
    job.active ||
    job.otherJob !== null ||
    job.downloading ||
    locked ||
    (rows ?? []).some((row) => row.starting);

  return (
    <Card title={title} className="ui-zip-panel">
      {/* First load only: the placeholder rows keep the panel's height, so the
          real rows replace them without moving anything. */}
      {countsRequest?.loading && !rows && (
        <div
          className="ui-zip-panel__rows"
          role="status"
          aria-label={countsRequest.loadingLabel}
        >
          {Array.from({ length: countsRequest.placeholderRows }, (_, row) => (
            <div
              className="ui-zip-panel__row ui-zip-panel__row--skeleton"
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
      {countsRequest && !countsRequest.loading && countsRequest.error && (
        <Notice className="ui-zip-panel__retry">
          {countsRequest.error}
          <Button
            type="button"
            variant="secondary"
            onClick={countsRequest.onRetry}
          >
            Reintentar
          </Button>
        </Notice>
      )}
      {rows && (
        <div
          className={
            countsRequest
              ? "ui-zip-panel__rows ui-zip-panel__enter"
              : "ui-zip-panel__rows"
          }
        >
          {rows.map((row) => (
            <div className="ui-zip-panel__row" key={row.id}>
              <div>
                <strong>{row.label}</strong>
                {row.count > 0 && (
                  <span>{`${COUNT_FORMATTER.format(row.count)} PDF`}</span>
                )}
                {row.count === 0 && row.emptyText && (
                  <span>{row.emptyText}</span>
                )}
              </div>
              <Button
                type="button"
                disabled={row.count === 0 || busy}
                loading={row.starting}
                aria-label={row.actionLabel}
                onClick={row.onGenerate}
              >
                Generar ZIP
              </Button>
            </div>
          ))}
        </div>
      )}
      <PdfJobProgress
        state={job}
        runningTitle={runningTitle}
        readyLabel={readyLabel}
      />
      {notice && (
        <Reveal>
          <Notice variant={notice.variant}>{notice.text}</Notice>
          {notice.documents.length > 0 && (
            <IncompleteDocumentList
              documents={notice.documents}
              label={incompleteLabel}
            />
          )}
        </Reveal>
      )}
    </Card>
  );
}
