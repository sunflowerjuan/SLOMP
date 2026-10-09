import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { getErrorMessage } from "../../api/ApiError";
import { messageForErrorCode } from "../../api/errorMessages";
import {
  consultSettlements,
  generateLiquidationPdf,
} from "../../api/publicConsultation";
import type {
  PublicConsultationCriteria,
  PublicSettlement,
} from "../../api/publicConsultation";
import {
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_VARIANT,
} from "../../domain/settlementStatus";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Notice } from "../../components/ui/Notice";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table } from "../../components/ui/Table";
import { TableRow } from "../../components/ui/TableRow";
import { triggerBrowserDownload } from "../../utils/downloadBlob";
import { formatPeriods } from "../../utils/formatPeriods";
import "./PublicConsultationPage.css";

// Exact match on at least 2 of the 3 fields.
const MIN_FILLED_FIELDS = 2;

interface FormValues {
  cadastralCode: string;
  ownerName: string;
  address: string;
}

const EMPTY_FORM: FormValues = {
  cadastralCode: "",
  ownerName: "",
  address: "",
};

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
  | { kind: "found"; results: PublicSettlement[] };

interface PdfDownloadState {
  loading: boolean;
  error: string | null;
}

function toCriteria(values: FormValues) {
  // Only filled-in fields are sent. trim() is the frontend's only
  // normalization: the exact match is the backend's responsibility.
  const criteria: {
    cadastralCode?: string;
    ownerName?: string;
    address?: string;
  } = {};
  const cadastralCode = values.cadastralCode.trim();
  const ownerName = values.ownerName.trim();
  const address = values.address.trim();
  if (cadastralCode) criteria.cadastralCode = cadastralCode;
  if (ownerName) criteria.ownerName = ownerName;
  if (address) criteria.address = address;
  return criteria;
}

// Whole pesos without decimals ($ 1.284.500); with cents, always two
// ($ 1.376.200,50) -- never a single decimal.
const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const currencyWithCentsFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatAmount(amount: number): string {
  if (!Number.isFinite(amount)) {
    return String(amount);
  }
  return Number.isInteger(amount)
    ? currencyFormatter.format(amount)
    : currencyWithCentsFormatter.format(amount);
}

function StatusCell({ status }: { status: PublicSettlement["status"] }) {
  return status === "MIXED" ? (
    <StatusBadge variant="neutral">Mixto</StatusBadge>
  ) : (
    <StatusBadge variant={SETTLEMENT_STATUS_VARIANT[status]}>
      {SETTLEMENT_STATUS_LABEL[status]}
    </StatusBadge>
  );
}

export function PublicConsultationPage() {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const [submittedCriteria, setSubmittedCriteria] =
    useState<PublicConsultationCriteria | null>(null);
  const [pdfState, setPdfState] = useState<Record<number, PdfDownloadState>>(
    {},
  );
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const settled = search.kind !== "idle" && search.kind !== "loading";
  useEffect(() => {
    // Bring the outcome into view and into the screen reader's focus.
    if (settled) resultsRef.current?.focus();
  }, [settled, search]);

  const filledCount = Object.keys(toCriteria(values)).length;

  function handleChange(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (formError) {
      setFormError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const criteria = toCriteria(values);

    if (Object.keys(criteria).length < MIN_FILLED_FIELDS) {
      setFormError(messageForErrorCode("PUBLIC_QUERY_CRITERIA_REQUIRED"));
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFormError(null);
    setSearch({ kind: "loading" });

    try {
      const results = await consultSettlements(criteria, controller.signal);
      // Without an exact match the backend responds 200 with `[]`: never a
      // 404 that would distinguish "doesn't exist" from "wrong data", and
      // never a hint at which field failed.
      setSearch(
        results.length === 0
          ? { kind: "not-found" }
          : { kind: "found", results },
      );
      setSubmittedCriteria(criteria);
      setPdfState({});
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setSearch({
        kind: "error",
        message: getErrorMessage(error, { audience: "public" }),
      });
    }
  }

  function handleClear() {
    abortRef.current?.abort();
    setValues(EMPTY_FORM);
    setFormError(null);
    setSearch({ kind: "idle" });
    setSubmittedCriteria(null);
    setPdfState({});
  }

  async function handleDownloadPdf(settlementId: number) {
    if (!submittedCriteria) return;

    setPdfState((current) => ({
      ...current,
      [settlementId]: { loading: true, error: null },
    }));
    try {
      const { blob, fileName } = await generateLiquidationPdf(
        settlementId,
        submittedCriteria,
      );
      triggerBrowserDownload(blob, fileName ?? "liquidacion.pdf");
      setPdfState((current) => ({
        ...current,
        [settlementId]: { loading: false, error: null },
      }));
    } catch (caught) {
      setPdfState((current) => ({
        ...current,
        [settlementId]: {
          loading: false,
          error: getErrorMessage(caught, { audience: "public" }),
        },
      }));
    }
  }

  return (
    <div className="public-consultation">
      <header className="public-consultation__topbar">
        <div className="public-consultation__topbar-inner">
          <div className="public-consultation__brand">
            <span className="public-consultation__brand-tag">SLOMP</span>
            <span className="public-consultation__brand-name">
              Tributaria Predial
            </span>
          </div>
        </div>
      </header>

      <main className="public-consultation__main">
        <PageHeader title="Consulta de liquidaciones del impuesto predial" />

        <Card
          title="Datos del predio"
          subtitle="Ingresa al menos 2 de los 3 datos tal como aparecen en tu liquidación o en el recibo del predio."
        >
          <form
            className="public-consultation__form"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="public-consultation__fields">
              <Input
                label="Cédula catastral"
                placeholder="000-00-0000-000"
                autoComplete="off"
                value={values.cadastralCode}
                onChange={(event) =>
                  handleChange("cadastralCode", event.target.value)
                }
              />
              <Input
                label="Propietario"
                placeholder="Nombre completo"
                autoComplete="name"
                value={values.ownerName}
                onChange={(event) =>
                  handleChange("ownerName", event.target.value)
                }
              />
              <Input
                label="Dirección del predio"
                placeholder="Calle 00 # 00-00"
                autoComplete="off"
                value={values.address}
                onChange={(event) =>
                  handleChange("address", event.target.value)
                }
              />
            </div>

            <div className="public-consultation__form-footer">
              <p
                className={[
                  "public-consultation__counter",
                  filledCount >= MIN_FILLED_FIELDS
                    ? "public-consultation__counter--ok"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-live="polite"
              >
                {filledCount} de 3 datos ingresados
                {filledCount < MIN_FILLED_FIELDS
                  ? ` · faltan ${MIN_FILLED_FIELDS - filledCount}`
                  : " · listo para consultar"}
              </p>
              <div className="public-consultation__actions">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleClear}
                  disabled={search.kind === "loading"}
                >
                  Limpiar
                </Button>
                <Button type="submit" loading={search.kind === "loading"}>
                  Consultar
                </Button>
              </div>
            </div>

            {formError && <Notice>{formError}</Notice>}
          </form>
        </Card>

        <div
          ref={resultsRef}
          className="public-consultation__results"
          role="region"
          aria-label="Resultado de la consulta"
          tabIndex={-1}
        >
          {search.kind === "loading" && (
            <Notice variant="info">Buscando liquidaciones…</Notice>
          )}

          {search.kind === "not-found" && (
            <Card
              title="No encontramos liquidaciones vigentes"
              subtitle="Verifica que los datos coincidan exactamente con los registrados en tu liquidación o recibo del predio. Si el problema continúa, acércate a la Secretaría de Hacienda del municipio."
            >
              {null}
            </Card>
          )}

          {search.kind === "error" && <Notice>{search.message}</Notice>}

          {search.kind === "found" && (
            <Card
              title="Liquidaciones del predio"
              className="public-consultation__found"
            >
              <dl className="public-consultation__property">
                <div>
                  <dt>Cédula catastral</dt>
                  <dd>{search.results[0].cadastralCode}</dd>
                </div>
                <div>
                  <dt>Dirección</dt>
                  <dd>{search.results[0].address}</dd>
                </div>
                <div>
                  <dt>Liquidaciones encontradas</dt>
                  <dd>{search.results.length}</dd>
                </div>
              </dl>

              {/* Desktop: table. Mobile: stacked cards. */}
              <div className="public-consultation__table">
                <Table
                  columns={["Periodos", "Valor total", "Estado", "Liquidación"]}
                >
                  {search.results.map((settlement) => (
                    <TableRow
                      key={settlement.settlementId}
                      cells={[
                        formatPeriods(settlement.periods),
                        formatAmount(settlement.totalAmount),
                        <StatusCell key="estado" status={settlement.status} />,
                        <PdfButton
                          key="pdf"
                          settlementId={settlement.settlementId}
                          state={pdfState[settlement.settlementId]}
                          onDownload={handleDownloadPdf}
                        />,
                      ]}
                    />
                  ))}
                </Table>
              </div>

              <ul className="public-consultation__list">
                {search.results.map((settlement) => (
                  <li
                    key={settlement.settlementId}
                    className="public-consultation__item"
                  >
                    <div className="public-consultation__item-head">
                      <span className="public-consultation__item-period">
                        Periodos {formatPeriods(settlement.periods)}
                      </span>
                      <StatusCell status={settlement.status} />
                    </div>
                    <dl className="public-consultation__item-data">
                      <div>
                        <dt>Valor total</dt>
                        <dd>{formatAmount(settlement.totalAmount)}</dd>
                      </div>
                    </dl>
                    <PdfButton
                      settlementId={settlement.settlementId}
                      state={pdfState[settlement.settlementId]}
                      onDownload={handleDownloadPdf}
                      fullWidth
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

function PdfButton({
  settlementId,
  state,
  onDownload,
  fullWidth,
}: {
  settlementId: number;
  state: PdfDownloadState | undefined;
  onDownload: (settlementId: number) => void;
  fullWidth?: boolean;
}) {
  return (
    <div className="public-consultation__pdf-cell">
      <Button
        variant="secondary"
        fullWidth={fullWidth}
        loading={state?.loading}
        onClick={() => onDownload(settlementId)}
      >
        Descargar PDF
      </Button>
      {state?.error && <Notice>{state.error}</Notice>}
    </div>
  );
}
