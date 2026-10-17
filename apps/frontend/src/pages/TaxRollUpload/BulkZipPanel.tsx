import { useCallback, useEffect, useState } from "react";
import { ApiError, getErrorMessage } from "../../api/ApiError";
import {
  getPendingLiquidationCounts,
  startLiquidationsJob,
} from "../../api/pdfJobs";
import type {
  LiquidationKind,
  PendingLiquidationCounts,
} from "../../api/pdfJobs";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Notice } from "../../components/ui/Notice";
import { PdfJobProgress } from "../../components/ui/PdfJobProgress";
import { Reveal } from "../../components/ui/Reveal";
import { incompleteDocuments } from "../../domain/pdfJob";
import type { IncompleteDocument } from "../../domain/pdfJob";
import { usePdfJob } from "../../hooks/usePdfJob";
import { IncompleteDocumentList } from "./IncompleteDocumentList";
import "./BulkZipPanel.css";

interface BulkZipPanelProps {
  refreshKey?: string | number;
}

const COUNT_FORMATTER = new Intl.NumberFormat("es-CO");

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

interface PanelNotice {
  variant: "info" | "error";
  text: string;
  // Only for the 400 LIQUIDATION_DATA_INCOMPLETE of a new job.
  documents: IncompleteDocument[];
}

export function BulkZipPanel({ refreshKey }: BulkZipPanelProps) {
  const [counts, setCounts] = useState<PendingLiquidationCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState("");
  const [startingKind, setStartingKind] = useState<LiquidationKind | null>(
    null,
  );
  const [notice, setNotice] = useState<PanelNotice | null>(null);

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

  const pdfJob = usePdfJob("LIQUIDACION", () => void loadCounts());
  const { job } = pdfJob;

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => void loadCounts(controller.signal), 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [loadCounts, refreshKey]);

  async function handleGenerate(kind: LiquidationKind) {
    setNotice(null);
    pdfJob.discardFinished();
    setStartingKind(kind);
    try {
      pdfJob.follow(await startLiquidationsJob(kind), kind);
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : null;
      if (code === "NO_PENDING_LIQUIDATIONS") {
        setNotice({
          variant: "info",
          text: getErrorMessage(caught),
          documents: [],
        });
      } else if (code === "BULK_GENERATION_IN_PROGRESS") {
        // Started from another tab, by another Administrator or for payment
        // orders: show what is running.
        pdfJob.adoptRunning();
      } else {
        setNotice({
          variant: "error",
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

  const busy =
    pdfJob.active ||
    pdfJob.otherJob !== null ||
    startingKind !== null ||
    pdfJob.downloading;

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
      <PdfJobProgress
        state={pdfJob}
        runningTitle={
          job?.kind ? KIND_TEXT[job.kind].running : "Generando liquidaciones"
        }
        readyLabel={job?.kind ? KIND_TEXT[job.kind].label : null}
      />
      {notice && (
        <Reveal>
          <Notice variant={notice.variant}>{notice.text}</Notice>
          {notice.documents.length > 0 && (
            <IncompleteDocumentList documents={notice.documents} />
          )}
        </Reveal>
      )}
    </Card>
  );
}
