import { useState } from "react";
import { ApiError, getErrorMessage } from "../../api/ApiError";
import { startPaymentOrdersJob } from "../../api/pdfJobs";
import { ZipJobPanel } from "../../components/ui/ZipJobPanel";
import type { ZipJobNotice } from "../../components/ui/ZipJobPanel";
import { incompleteDocuments } from "../../domain/pdfJob";
import type { PdfJobState } from "../../hooks/usePdfJob";

interface PaymentOrderZipPanelProps {
  pdfJob: PdfJobState;
  // Settlements of the payment orders still to issue; null until an Excel is
  // reviewed.
  settlementIds: number[] | null;
  count: number;
  // An individual payment order is being issued.
  locked: boolean;
  // The Excel's eligibility changed since it was reviewed.
  onStale: () => void;
}

// Every payment order of the reviewed Excel in one ZIP, through the PDF
// service (SL-129). Each one takes its number when the job starts.
export function PaymentOrderZipPanel({
  pdfJob,
  settlementIds,
  count,
  locked,
  onStale,
}: PaymentOrderZipPanelProps) {
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState<ZipJobNotice | null>(null);

  async function handleGenerate() {
    if (!settlementIds) return;
    setNotice(null);
    pdfJob.discardFinished();
    setStarting(true);
    try {
      pdfJob.follow(await startPaymentOrdersJob(settlementIds));
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : null;
      if (code === "BULK_GENERATION_IN_PROGRESS") {
        // Started from another tab, by another Administrator or for
        // liquidations: show what is running.
        pdfJob.adoptRunning();
      } else {
        setNotice({
          variant: "error",
          text: getErrorMessage(caught, { document: "MANDAMIENTO" }),
          documents:
            caught instanceof ApiError
              ? incompleteDocuments(caught.details)
              : [],
        });
        if (code === "PAYMENT_ORDER_INELIGIBLE") onStale();
      }
    } finally {
      setStarting(false);
    }
  }

  return (
    <ZipJobPanel
      title="Todos en un ZIP"
      rows={[
        {
          id: "MANDAMIENTO",
          label: "Mandamientos",
          count,
          // Before an Excel is reviewed the row only has its label.
          emptyText: settlementIds ? "Sin mandamientos" : undefined,
          actionLabel: "Generar ZIP de mandamientos",
          starting,
          onGenerate: () => void handleGenerate(),
        },
      ]}
      locked={locked}
      job={pdfJob}
      runningTitle="Generando mandamientos"
      readyLabel="Mandamientos"
      notice={notice}
      incompleteLabel="Mandamientos con datos incompletos"
    />
  );
}
