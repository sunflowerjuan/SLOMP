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
import { ZipJobPanel } from "../../components/ui/ZipJobPanel";
import type { ZipJobNotice } from "../../components/ui/ZipJobPanel";
import { incompleteDocuments } from "../../domain/pdfJob";
import { usePdfJob } from "../../hooks/usePdfJob";

interface BulkZipPanelProps {
  refreshKey?: string | number;
}

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

export function BulkZipPanel({ refreshKey }: BulkZipPanelProps) {
  const [counts, setCounts] = useState<PendingLiquidationCounts | null>(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [countsError, setCountsError] = useState("");
  const [startingKind, setStartingKind] = useState<LiquidationKind | null>(
    null,
  );
  const [notice, setNotice] = useState<ZipJobNotice | null>(null);

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

  return (
    <ZipJobPanel
      title="Liquidaciones listas para generar"
      rows={
        counts &&
        KINDS.map((kind) => ({
          id: kind,
          label: KIND_TEXT[kind].label,
          count: kind === "NORMAL" ? counts.normal : counts.prescriptionRisk,
          emptyText: "Sin liquidaciones",
          actionLabel: KIND_TEXT[kind].generate,
          starting: startingKind === kind,
          onGenerate: () => void handleGenerate(kind),
        }))
      }
      countsRequest={{
        loading: countsLoading,
        loadingLabel: "Cargando liquidaciones pendientes",
        placeholderRows: KINDS.length,
        error: countsError,
        onRetry: () => void loadCounts(),
      }}
      job={pdfJob}
      runningTitle={
        job?.kind ? KIND_TEXT[job.kind].running : "Generando liquidaciones"
      }
      readyLabel={job?.kind ? KIND_TEXT[job.kind].label : null}
      notice={notice}
      incompleteLabel="Liquidaciones con datos incompletos"
    />
  );
}
