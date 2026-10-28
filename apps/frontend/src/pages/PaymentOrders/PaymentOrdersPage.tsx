import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  PaymentOrderImportPreview,
  PaymentOrderSummary,
} from "../../api/paymentOrders";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Notice } from "../../components/ui/Notice";
import { RowIssueList } from "../../components/ui/RowIssueList";
import { Screen } from "../../components/ui/Screen";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Steps } from "../../components/ui/Steps";
import { UploadForm } from "../../components/ui/UploadForm";
import { ZipJobPanel } from "../../components/ui/ZipJobPanel";
import {
  generationRows,
  groupEligibleByProperty,
  issuedFromOrders,
  newestFirst,
  rejectedPeriods,
  reviewSummary,
} from "../../domain/paymentOrder";
import type {
  IssuedCandidate,
  PaymentOrderCandidate,
} from "../../domain/paymentOrder";
import { usePaymentOrderPdf } from "../../hooks/usePaymentOrderPdf";
import { usePdfJob } from "../../hooks/usePdfJob";
import { formatCount } from "../../utils/formatCount";
import { GeneratePaymentOrderDialog } from "./GeneratePaymentOrderDialog";
import { IneligiblePaymentOrderList } from "./IneligiblePaymentOrderList";
import { IssuedPaymentOrderList } from "./IssuedPaymentOrderList";
import { PaymentOrderCandidateList } from "./PaymentOrderCandidateList";
import { PaymentOrderZipPanel } from "./PaymentOrderZipPanel";
import { SlompsimButton } from "./SlompsimButton";
import "./PaymentOrdersPage.css";

type Tab = "generar" | "historial";
type Step = "upload" | "review" | "generate";

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "generar", label: "Generar" },
  { value: "historial", label: "Historial" },
];

const STEPS: { value: Step; label: string }[] = [
  { value: "upload", label: "Cargar" },
  { value: "review", label: "Revisar" },
  { value: "generate", label: "Generar" },
];

interface PageNotice {
  variant: "info" | "error";
  text: string;
}

function invalidRowsText(count: number): string {
  return `El archivo tiene ${formatCount(count, "fila inválida", "filas inválidas")} y no se puede revisar. ${count === 1 ? "Corrígela" : "Corrígelas"} en el Excel y vuelve a cargarlo.`;
}

// Payment orders (SL-130; rules in Confluence, SL-127; flow SL-173). The
// Excel has the same columns as the tax roll and lists, per property, the
// periods to collect. "Generar" goes in three steps, one view at a time:
// load the Excel, review what it allows (reading it saves nothing), and
// generate the payment orders of the properties whose periods are "En
// firme", one at a time or all in a ZIP. "Historial" lists the issued ones.
export function PaymentOrdersPage() {
  // Both survive switching tabs: the page stays mounted.
  const [tab, setTab] = useState<Tab>("generar");
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PaymentOrderImportPreview | null>(
    null,
  );
  // Issued from this screen for the current Excel, by cadastral code. Kept
  // when the same Excel is reviewed again.
  const [issued, setIssued] = useState<Record<string, IssuedCandidate>>({});
  const [toGenerate, setToGenerate] = useState<PaymentOrderCandidate | null>(
    null,
  );
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [notice, setNotice] = useState<PageNotice | null>(null);
  const [orders, setOrders] = useState<PaymentOrderSummary[] | null>(null);
  const [ordersError, setOrdersError] = useState("");
  const [query, setQuery] = useState("");
  const stepRef = useRef<HTMLDivElement>(null);
  const shownStep = useRef(step);
  const pdf = usePaymentOrderPdf();

  const loadOrders = useCallback(async () => {
    try {
      const found = newestFirst(await listPaymentOrders());
      setOrders(found);
      setOrdersError("");
      return found;
    } catch (caught) {
      setOrdersError(getErrorMessage(caught));
      return null;
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

  // Reads the Excel (nothing is saved). null when it couldn't be read; the
  // cause is then in `error`, shown by the step "Cargar".
  const review = useCallback(async (target: File) => {
    setError(null);
    setIsReviewing(true);
    try {
      const found = await importPaymentOrders(target);
      setPreview(found);
      return found;
    } catch (caught) {
      setPreview(null);
      setError(getErrorMessage(caught));
      return null;
    } finally {
      setIsReviewing(false);
    }
  }, []);

  const candidates = useMemo(
    () => (preview ? groupEligibleByProperty(preview.eligible) : []),
    [preview],
  );
  const pending = candidates.filter(
    (candidate) => !issued[candidate.cadastralCode],
  );

  // A finished ZIP issued numbers: the history gains them, its rows show
  // them, and the Excel, read again, no longer offers those properties.
  const pdfJob = usePdfJob("MANDAMIENTO", (job) => {
    if (job.status !== "DONE") return;
    const inJob = pending;
    void loadOrders().then((found) => {
      if (found) {
        setIssued((current) => ({
          ...issuedFromOrders(inJob, found),
          ...current,
        }));
      }
    });
    if (file) {
      void review(file).then((found) => {
        if (!found) setStep("upload");
      });
    }
  });

  useEffect(() => {
    // A new step is announced by moving focus to it.
    if (shownStep.current === step) return;
    shownStep.current = step;
    stepRef.current?.focus({ preventScroll: true });
  }, [step]);

  // A new file, no file, or "Cambiar archivo": back to the first step.
  function startOver(next: File | null) {
    setFile(next);
    setPreview(null);
    setIssued({});
    setError(null);
    setNotice(null);
    setStep("upload");
  }

  async function handleReview() {
    if (!file) return;
    setNotice(null);
    const found = await review(file);
    // Invalid rows stay in "Cargar", with their reasons, until fixed.
    if (found && found.invalidRows.length === 0) setStep("review");
  }

  // The Excel stopped allowing what it allowed when reviewed: read it again
  // and say why on "Revisar".
  async function reviewAgain(reason: PageNotice) {
    if (!file) return;
    const found = await review(file);
    setNotice(reason);
    setStep(found ? "review" : "upload");
  }

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
        void reviewAgain({
          variant: "error",
          text: PAYMENT_ORDER_NOT_ISSUED_MESSAGE,
        });
        return;
      }
      setIssued((current) => ({
        ...current,
        [candidate.cadastralCode]: {
          candidate,
          paymentOrderId: order.paymentOrderId,
          number: order.number,
        },
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
  const stepIndex = STEPS.findIndex((entry) => entry.value === step);

  // A ZIP running or ready (perhaps from an earlier visit) stays in sight
  // outside "Generar", where its panel lives.
  const jobOutsideItsStep = step !== "generate" &&
    (pdfJob.active || pdfJob.ready) && (
      <ZipJobPanel
        title="Todos en un ZIP"
        rows={null}
        job={pdfJob}
        runningTitle="Generando mandamientos"
        readyLabel="Mandamientos"
        notice={null}
        incompleteLabel="Mandamientos con datos incompletos"
      />
    );

  return (
    <Screen
      className="payment-orders-page"
      title="Mandamientos"
      action={<SlompsimButton />}
      input={
        <div className="payment-orders-page__controls">
          <SegmentedControl
            label="Mandamientos"
            name="payment-orders-tab"
            options={TAB_OPTIONS}
            value={tab}
            onChange={setTab}
          />
          {tab === "generar" && (
            <>
              <Steps
                label="Pasos para generar mandamientos"
                steps={STEPS.map((entry) => entry.label)}
                current={stepIndex}
              />
              {step === "review" && preview && (
                <div className="payment-orders-page__step-bar">
                  <p className="payment-orders-page__summary">
                    {reviewSummary(preview)}
                  </p>
                  <div className="payment-orders-page__step-actions">
                    <Button
                      variant="secondary"
                      disabled={isReviewing}
                      onClick={() => startOver(null)}
                    >
                      Cambiar archivo
                    </Button>
                    <Button
                      disabled={candidates.length === 0 || isReviewing}
                      onClick={() => setStep("generate")}
                    >
                      Continuar
                    </Button>
                  </div>
                </div>
              )}
              {step === "generate" && (
                <div className="payment-orders-page__step-bar">
                  <div className="payment-orders-page__step-actions">
                    <Button
                      variant="secondary"
                      disabled={generating}
                      onClick={() => setStep("review")}
                    >
                      Volver
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
          {tab === "historial" && (
            <div className="payment-orders-page__search">
              <Input
                label="Buscar por cédula catastral"
                type="search"
                inputMode="numeric"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          )}
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
      {tab === "historial" ? (
        <IssuedPaymentOrderList
          orders={orders}
          query={query}
          error={ordersError}
          onRetry={() => void loadOrders()}
          downloadingId={pdf.downloadingId}
          downloadError={pdf.error?.source === "issued" ? pdf.error : null}
          onDownload={(order) =>
            void pdf.download(order.id, order.number, "issued")
          }
        />
      ) : (
        <div
          ref={stepRef}
          className="payment-orders-page__step"
          role="region"
          aria-label={`Paso ${stepIndex + 1} de ${STEPS.length}: ${STEPS[stepIndex].label}`}
          tabIndex={-1}
        >
          {step === "upload" && (
            <>
              <UploadForm
                file={file}
                onFileSelect={startOver}
                onClear={() => startOver(null)}
                actionLabel="Revisar archivo"
                busy={isReviewing}
                onSubmit={() => void handleReview()}
              />
              {notice && (
                <Notice variant={notice.variant}>{notice.text}</Notice>
              )}
              {error && <Notice>{error}</Notice>}
              {preview && preview.invalidRows.length > 0 && (
                <Card title="Filas inválidas">
                  <Notice>{invalidRowsText(preview.invalidRows.length)}</Notice>
                  <RowIssueList issues={preview.invalidRows} />
                </Card>
              )}
              {jobOutsideItsStep}
            </>
          )}

          {step === "review" && preview && (
            <>
              {notice && (
                <Notice variant={notice.variant}>{notice.text}</Notice>
              )}
              {/* SL-156 adds here the access to Slompsim for the periods
                  that are liquidated but missing from the Excel. */}
              <Card title="Elegibles">
                <PaymentOrderCandidateList
                  candidates={candidates}
                  label="Elegibles"
                />
              </Card>
              <IneligiblePaymentOrderList rows={preview.ineligible} />
              {preview.warnings.length > 0 && (
                <Card title="Advertencias">
                  <RowIssueList issues={preview.warnings} />
                </Card>
              )}
              {jobOutsideItsStep}
            </>
          )}

          {step === "generate" && (
            <>
              {notice && (
                <Notice variant={notice.variant}>{notice.text}</Notice>
              )}
              <PaymentOrderZipPanel
                pdfJob={pdfJob}
                settlementIds={pending.flatMap(
                  (candidate) => candidate.settlementIds,
                )}
                count={pending.length}
                locked={generating}
                onStale={(text) => void reviewAgain({ variant: "error", text })}
              />
              <Card title="Uno por uno">
                {jobHoldsNumbers && (
                  <Notice variant="info">
                    Mientras haya una generación masiva en curso no se pueden
                    generar mandamientos uno por uno.
                  </Notice>
                )}
                <PaymentOrderCandidateList
                  candidates={generationRows(candidates, issued)}
                  label="Uno por uno"
                  generation={{
                    issued,
                    locked: jobHoldsNumbers || generating,
                    downloadingId: pdf.downloadingId,
                    downloadError:
                      pdf.error?.source === "candidates" ? pdf.error : null,
                    onGenerate: (candidate) => {
                      setGenerateError(null);
                      setToGenerate(candidate);
                    },
                    onDownload: (order) =>
                      void pdf.download(
                        order.paymentOrderId,
                        order.number,
                        "candidates",
                      ),
                  }}
                />
              </Card>
            </>
          )}
        </div>
      )}
    </Screen>
  );
}
