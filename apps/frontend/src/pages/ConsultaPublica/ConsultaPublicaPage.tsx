import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { getErrorMessage } from "../../api/ApiError";
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
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table } from "../../components/ui/Table";
import { TableRow } from "../../components/ui/TableRow";
import { ADMIN_HREF } from "../../routes";
import { triggerBrowserDownload } from "../../utils/downloadBlob";
import "./ConsultaPublicaPage.css";

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

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatAmount(amount: number): string {
  if (!Number.isFinite(amount)) {
    return String(amount);
  }
  return Number.isInteger(amount)
    ? currencyFormatter.format(amount)
    : currencyWithCentsFormatter.format(amount);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date);
}

export function ConsultaPublicaPage() {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const [submittedCriteria, setSubmittedCriteria] =
    useState<PublicConsultationCriteria | null>(null);
  const [pdfState, setPdfState] = useState<Record<number, PdfDownloadState>>(
    {},
  );
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

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
      setFormError(
        "Ingresa al menos 2 de los 3 datos del predio para realizar la consulta.",
      );
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
      setSearch({ kind: "error", message: getErrorMessage(error) });
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
        [settlementId]: { loading: false, error: getErrorMessage(caught) },
      }));
    }
  }

  return (
    <div className="consulta-publica">
      <header className="consulta-publica__topbar">
        <div className="consulta-publica__topbar-inner">
          <div className="consulta-publica__brand">
            <span className="consulta-publica__brand-tag">SLOMP</span>
            <span className="consulta-publica__brand-name">
              Tributaria Predial
            </span>
          </div>
          <a className="consulta-publica__admin-link" href={ADMIN_HREF}>
            Acceso administrador
          </a>
        </div>
      </header>

      <main className="consulta-publica__main">
        <header className="consulta-publica__header">
          <h1 className="consulta-publica__title">
            Consulta de liquidaciones del impuesto predial
          </h1>
          <p className="consulta-publica__subtitle">
            Consulta las liquidaciones oficiales de tu predio. No necesitas
            crear una cuenta.
          </p>
        </header>

        <section
          className="consulta-publica__card"
          aria-labelledby="consulta-publica-form-title"
        >
          <h2
            id="consulta-publica-form-title"
            className="consulta-publica__card-title"
          >
            Datos del predio
          </h2>
          <p className="consulta-publica__card-subtitle">
            Ingresa al menos 2 de los 3 datos tal como aparecen en tu
            liquidación o en el recibo del predio.
          </p>

          <form
            className="consulta-publica__form"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="consulta-publica__fields">
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
                placeholder="Nombre completo del propietario"
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

            <div className="consulta-publica__form-footer">
              <p
                className={[
                  "consulta-publica__counter",
                  filledCount >= MIN_FILLED_FIELDS
                    ? "consulta-publica__counter--ok"
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
              <div className="consulta-publica__actions">
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

            {formError && (
              <p
                className="consulta-publica__message consulta-publica__message--danger"
                role="alert"
              >
                {formError}
              </p>
            )}
          </form>
        </section>

        <div aria-live="polite">
          {search.kind === "not-found" && (
            <section className="consulta-publica__card">
              <h2 className="consulta-publica__card-title">
                No encontramos liquidaciones vigentes
              </h2>
              <p className="consulta-publica__card-subtitle">
                Verifica que los datos coincidan exactamente con los registrados
                en tu liquidación o recibo del predio. Si el problema continúa,
                acércate a la Secretaría de Hacienda del municipio.
              </p>
            </section>
          )}

          {search.kind === "error" && (
            <p
              className="consulta-publica__message consulta-publica__message--danger"
              role="alert"
            >
              {search.message}
            </p>
          )}

          {search.kind === "found" && (
            <section
              className="consulta-publica__card"
              aria-labelledby="consulta-publica-results-title"
            >
              <h2
                id="consulta-publica-results-title"
                className="consulta-publica__card-title"
              >
                Liquidaciones del predio
              </h2>

              <dl className="consulta-publica__property">
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
              <div className="consulta-publica__table">
                <Table
                  columns={[
                    "Periodo",
                    "Fecha de expedición",
                    "Valor total",
                    "Estado",
                    "Liquidación",
                  ]}
                >
                  {search.results.map((settlement) => (
                    <TableRow
                      key={settlement.settlementId}
                      cells={[
                        settlement.period,
                        formatDate(settlement.issuedAt),
                        formatAmount(settlement.totalAmount),
                        <StatusBadge
                          key="estado"
                          variant={SETTLEMENT_STATUS_VARIANT[settlement.status]}
                        >
                          {SETTLEMENT_STATUS_LABEL[settlement.status]}
                        </StatusBadge>,
                        <div key="pdf" className="consulta-publica__pdf-cell">
                          <Button
                            variant="secondary"
                            loading={pdfState[settlement.settlementId]?.loading}
                            onClick={() =>
                              handleDownloadPdf(settlement.settlementId)
                            }
                          >
                            Descargar PDF
                          </Button>
                          {pdfState[settlement.settlementId]?.error && (
                            <p
                              className="consulta-publica__pdf-error"
                              role="alert"
                            >
                              {pdfState[settlement.settlementId]?.error}
                            </p>
                          )}
                        </div>,
                      ]}
                    />
                  ))}
                </Table>
              </div>

              <ul className="consulta-publica__list">
                {search.results.map((settlement) => (
                  <li
                    key={settlement.settlementId}
                    className="consulta-publica__item"
                  >
                    <div className="consulta-publica__item-head">
                      <span className="consulta-publica__item-period">
                        Periodo {settlement.period}
                      </span>
                      <StatusBadge
                        variant={SETTLEMENT_STATUS_VARIANT[settlement.status]}
                      >
                        {SETTLEMENT_STATUS_LABEL[settlement.status]}
                      </StatusBadge>
                    </div>
                    <dl className="consulta-publica__item-data">
                      <div>
                        <dt>Expedición</dt>
                        <dd>{formatDate(settlement.issuedAt)}</dd>
                      </div>
                      <div>
                        <dt>Valor total</dt>
                        <dd>{formatAmount(settlement.totalAmount)}</dd>
                      </div>
                    </dl>
                    <div className="consulta-publica__item-actions">
                      <Button
                        variant="secondary"
                        fullWidth
                        loading={pdfState[settlement.settlementId]?.loading}
                        onClick={() =>
                          handleDownloadPdf(settlement.settlementId)
                        }
                      >
                        Descargar PDF
                      </Button>
                      {pdfState[settlement.settlementId]?.error && (
                        <p className="consulta-publica__pdf-error" role="alert">
                          {pdfState[settlement.settlementId]?.error}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
