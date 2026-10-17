import { useState } from "react";
import { ApiError, getErrorMessage } from "../../api/ApiError";
import { startPaymentOrdersJob } from "../../api/pdfJobs";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Notice } from "../../components/ui/Notice";
import { PdfJobProgress } from "../../components/ui/PdfJobProgress";
import { Reveal } from "../../components/ui/Reveal";
import { incompleteDocuments } from "../../domain/pdfJob";
import type { IncompleteDocument } from "../../domain/pdfJob";
import type { PdfJobState } from "../../hooks/usePdfJob";
import { IncompleteDocumentList } from "../TaxRollUpload/IncompleteDocumentList";
// Same rows as the liquidations ZIP panel.
import "../TaxRollUpload/BulkZipPanel.css";
import "./PaymentOrderZipPanel.css";

const COUNT_FORMATTER = new Intl.NumberFormat("es-CO");

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

interface PanelNotice {
  text: string;
  // Only for the 400 LIQUIDATION_DATA_INCOMPLETE of a new job.
  documents: IncompleteDocument[];
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
  const [notice, setNotice] = useState<PanelNotice | null>(null);

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

  const busy =
    pdfJob.active ||
    pdfJob.otherJob !== null ||
    pdfJob.downloading ||
    starting ||
    locked;

  let summary = "Procesa un Excel de mandamientos";
  if (settlementIds) {
    summary = count
      ? `${COUNT_FORMATTER.format(count)} PDF`
      : "Sin mandamientos";
  }

  return (
    <Card title="Generación masiva" className="payment-order-zip-panel">
      <div className="bulk-zip-panel__rows">
        <div className="bulk-zip-panel__row">
          <div>
            <strong>Mandamientos en firme</strong>
            <span>{summary}</span>
          </div>
          <Button
            type="button"
            disabled={!count || busy}
            loading={starting}
            aria-label="Generar ZIP de mandamientos"
            onClick={() => void handleGenerate()}
          >
            Generar ZIP
          </Button>
        </div>
      </div>
      <PdfJobProgress
        state={pdfJob}
        runningTitle="Generando mandamientos"
        readyLabel="Mandamientos de pago"
      />
      {notice && (
        <Reveal>
          <Notice>{notice.text}</Notice>
          {notice.documents.length > 0 && (
            <IncompleteDocumentList
              documents={notice.documents}
              label="Mandamientos con datos incompletos"
            />
          )}
        </Reveal>
      )}
    </Card>
  );
}
