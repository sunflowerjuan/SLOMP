import { useState } from "react";
import { ApiError, getErrorMessage } from "../../api/ApiError";
import { startPaymentOrdersJob } from "../../api/pdfJobs";
import { ZipJobPanel } from "../../components/ui/ZipJobPanel";
import type { ZipJobNotice } from "../../components/ui/ZipJobPanel";
import { incompleteDocuments } from "../../domain/pdfJob";
import type { PdfJobState } from "../../hooks/usePdfJob";

interface PaymentOrderZipPanelProps {
  pdfJob: PdfJobState;
  // Settlements of the payment orders still to issue.
  settlementIds: number[];
  count: number;
  // An individual payment order is being issued.
  locked: boolean;
  // The Excel's eligibility changed since it was reviewed; the page reviews
  // it again and shows why.
  onStale: (message: string) => void;
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
    setNotice(null);
    pdfJob.discardFinished();
    setStarting(true);
    try {
      pdfJob.follow(await startPaymentOrdersJob(settlementIds));
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : null;
      const text = getErrorMessage(caught, { document: "MANDAMIENTO" });
      if (code === "BULK_GENERATION_IN_PROGRESS") {
        // Started from another tab, by another Administrator or for
        // liquidations: show what is running.
        pdfJob.adoptRunning();
      } else if (code === "PAYMENT_ORDER_INELIGIBLE") {
        onStale(text);
      } else {
        setNotice({
          variant: "error",
          text,
          documents:
            caught instanceof ApiError
              ? incompleteDocuments(caught.details)
              : [],
        });
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
          emptyText: "Sin mandamientos",
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
