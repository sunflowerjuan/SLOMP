import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { ApiError, getErrorMessage } from "../../api/ApiError";
import {
  PAYMENT_ORDER_NOT_ISSUED_MESSAGE,
  paymentOrderLeftOutMessage,
} from "../../api/errorMessages";
import {
  generatePaymentOrders,
  importPaymentOrders,
  listPaymentOrders,
} from "../../api/paymentOrders";
import type {
  IssuedPaymentOrder,
  PaymentOrderImportPreview,
  PaymentOrderSummary,
} from "../../api/paymentOrders";
import { Button } from "../../components/ui/Button";
import { Dropzone } from "../../components/ui/Dropzone";
import { Notice } from "../../components/ui/Notice";
import { Screen } from "../../components/ui/Screen";
import { UploadResult } from "../../components/ui/UploadResult";
import {
  groupEligibleByProperty,
  newestFirst,
  rejectedPeriods,
} from "../../domain/paymentOrder";
import type { PaymentOrderCandidate } from "../../domain/paymentOrder";
import { usePaymentOrderPdf } from "../../hooks/usePaymentOrderPdf";
import { countNoun } from "../../utils/formatCount";
import { usePdfJob } from "../../hooks/usePdfJob";
import { GeneratePaymentOrderDialog } from "./GeneratePaymentOrderDialog";
import { IneligiblePaymentOrderList } from "./IneligiblePaymentOrderList";
import { IssuedPaymentOrderList } from "./IssuedPaymentOrderList";
import { PaymentOrderCandidateList } from "./PaymentOrderCandidateList";
import { PaymentOrderZipPanel } from "./PaymentOrderZipPanel";
import { SlompsimButton } from "./SlompsimButton";
import "./PaymentOrdersPage.css";

interface PageNotice {
  variant: "info" | "error";
  text: string;
}

// Payment orders (SL-130; rules in Confluence, SL-127). The Excel has the
// same columns as the tax roll and lists, per property, the periods to
// collect; reviewing it saves nothing. The properties whose periods are "En
// firme" can then get their payment order, one at a time or all in a ZIP.
export function PaymentOrdersPage() {
  const isWide = useMediaQuery("(min-width: 1100px)");
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PaymentOrderImportPreview | null>(
    null,
  );
  // Issued from this screen since the Excel was reviewed, by cadastral code.
  const [issued, setIssued] = useState<Record<string, IssuedPaymentOrder>>({});
  const [toGenerate, setToGenerate] = useState<PaymentOrderCandidate | null>(
    null,
  );
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [orders, setOrders] = useState<PaymentOrderSummary[] | null>(null);
  const [ordersError, setOrdersError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const pdf = usePaymentOrderPdf();

  const loadOrders = useCallback(async () => {
    try {
      setOrders(newestFirst(await listPaymentOrders()));
      setOrdersError("");
    } catch (caught) {
      setOrdersError(getErrorMessage(caught));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    listPaymentOrders(controller.signal)
      .then((found) => setOrders(newestFirst(found)))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setOrdersError(getErrorMessage(caught));
      });
    return () => controller.abort();
  }, []);

  const review = useCallback(async (target: File) => {
    setError(null);
    setNotice(null);
    setIsProcessing(true);
    try {
      setPreview(await importPaymentOrders(target));
      setIssued({});
    } catch (caught) {
      setPreview(null);
      setError(getErrorMessage(caught));
    } finally {
      setIsProcessing(false);
    }
  }, []);

  // A finished ZIP issued numbers: the list gains them and the Excel, read
  // again, no longer offers those properties.
  const pdfJob = usePdfJob("MANDAMIENTO", (job) => {
    if (job.status !== "DONE") return;
    void loadOrders();
    if (file) void review(file);
  });

  function resetOutcome() {
    setPreview(null);
    setIssued({});
    setError(null);
    setNotice(null);
  }

  const candidates = useMemo(
    () => (preview ? groupEligibleByProperty(preview.eligible) : []),
    [preview],
  );
  const pending = candidates.filter(
    (candidate) => !issued[candidate.cadastralCode],
  );

  const previewKey = preview ? `${preview.fileName}-${preview.rows}` : null;
  useEffect(() => {
    // Announce the outcome: move focus to the result region.
    if (previewKey !== null) resultRef.current?.focus({ preventScroll: true });
  }, [previewKey]);

  async function handleGenerate() {
    if (!toGenerate) return;
    const candidate = toGenerate;
    setGenerateError(null);
    setNotice(null);
    setGenerating(true);
    try {
      const { created, rejected } = await generatePaymentOrders(
        candidate.settlementIds,
      );
      setToGenerate(null);
      const order = created[0];
      if (!order) {
        setNotice({ variant: "error", text: PAYMENT_ORDER_NOT_ISSUED_MESSAGE });
        if (file) void review(file);
        return;
      }
      setIssued((current) => ({
        ...current,
        [candidate.cadastralCode]: order,
      }));
      const leftOut = rejectedPeriods(candidate, rejected);
      if (leftOut.length > 0) {
        setNotice({
          variant: "info",
          text: paymentOrderLeftOutMessage(order.number, leftOut),
        });
      }
      void loadOrders();
      void pdf.download(order.paymentOrderId, order.number, "candidates");
    } catch (caught) {
      setGenerateError(getErrorMessage(caught, { document: "MANDAMIENTO" }));
      if (
        caught instanceof ApiError &&
        caught.code === "BULK_GENERATION_IN_PROGRESS"
      ) {
        pdfJob.adoptRunning();
      }
    } finally {
      setGenerating(false);
    }
  }

  // The municipality issues one batch of numbers at a time.
  const jobHoldsNumbers = pdfJob.active || pdfJob.otherJob !== null;

  // Beside the upload when there is room; after the result otherwise.
  const zipPanel = (
    <PaymentOrderZipPanel
      pdfJob={pdfJob}
      settlementIds={
        preview ? pending.flatMap((candidate) => candidate.settlementIds) : null
      }
      count={pending.length}
      locked={generating}
      onStale={() => file && void review(file)}
    />
  );

  return (
    <Screen
      className="payment-orders-page"
      title="Mandamientos"
      action={<SlompsimButton />}
      input={
        <div className="ui-screen__input-row">
          <div className="payment-orders-page__upload">
            <Dropzone
              file={file}
              onFileSelect={(selected) => {
                setFile(selected);
                resetOutcome();
              }}
              onClear={() => {
                setFile(null);
                resetOutcome();
              }}
            />

            <div className="payment-orders-page__actions">
              <Button
                type="button"
                disabled={!file}
                loading={isProcessing}
                onClick={() => file && void review(file)}
              >
                Revisar archivo
              </Button>
            </div>
          </div>
          {isWide && zipPanel}
        </div>
      }
      overlay={
        <GeneratePaymentOrderDialog
          candidate={toGenerate}
          isGenerating={generating}
          error={generateError}
          onCancel={() => setToGenerate(null)}
          onGenerate={() => void handleGenerate()}
        />
      }
    >
      {error && <Notice>{error}</Notice>}

      {preview && (
        <div
          ref={resultRef}
          className="payment-orders-page__result"
          role="region"
          aria-label="Resultado de la carga"
          tabIndex={-1}
        >
          <UploadResult
            subtitle={preview.fileName}
            stats={[
              {
                value: candidates.length,
                label: countNoun(
                  candidates.length,
                  "mandamiento por generar",
                  "mandamientos por generar",
                ),
              },
              {
                value: preview.eligible.length,
                label: countNoun(
                  preview.eligible.length,
                  "periodo en firme",
                  "periodos en firme",
                ),
              },
              {
                value: preview.ineligible.length,
                label: countNoun(
                  preview.ineligible.length,
                  "periodo no elegible",
                  "periodos no elegibles",
                ),
              },
            ]}
            invalidRows={preview.invalidRows}
            warnings={preview.warnings}
          >
            {notice && <Notice variant={notice.variant}>{notice.text}</Notice>}

            <h3 className="payment-orders-page__subheading">
              Listos para generar
            </h3>
            <PaymentOrderCandidateList
              candidates={candidates}
              issued={issued}
              locked={jobHoldsNumbers || generating}
              downloadingId={pdf.downloadingId}
              downloadError={
                pdf.error?.source === "candidates" ? pdf.error : null
              }
              onGenerate={(candidate) => {
                setGenerateError(null);
                setToGenerate(candidate);
              }}
              onDownload={(order) =>
                void pdf.download(
                  order.paymentOrderId,
                  order.number,
                  "candidates",
                )
              }
            />

            <IneligiblePaymentOrderList rows={preview.ineligible} />
          </UploadResult>
        </div>
      )}

      {!isWide && zipPanel}
      <IssuedPaymentOrderList
        orders={orders}
        error={ordersError}
        onRetry={() => void loadOrders()}
        downloadingId={pdf.downloadingId}
        downloadError={pdf.error?.source === "issued" ? pdf.error : null}
        onDownload={(order) =>
          void pdf.download(order.id, order.number, "issued")
        }
      />
    </Screen>
  );
}
