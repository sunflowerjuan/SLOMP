import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError, getErrorMessage } from "../../api/ApiError";
import {
  consultSettlements,
  downloadSettlementPdf,
} from "../../api/publicConsultation";
import type {
  PublicConsultationCriteria,
  PublicConsultationResult,
  PublicSettlement,
} from "../../api/publicConsultation";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table } from "../../components/ui/Table";
import { TableRow } from "../../components/ui/TableRow";
import { ADMIN_HREF } from "../../routes";
import "./ConsultaPublicaPage.css";

// RF-15: exact match on at least 2 of the 3 fields.
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
  | {
      kind: "found";
      result: PublicConsultationResult;
      // The EXACT data the backend matched the property with: the PDF
      // download resends it so the backend can re-validate it, even if the
      // taxpayer edited the fields after searching.
      criteria: PublicConsultationCriteria;
    };

function toCriteria(values: FormValues): PublicConsultationCriteria {
  // Only filled-in fields are sent. trim() is the frontend's only
  // normalization: the exact match (RNF-04) is the backend's responsibility.
  const criteria: PublicConsultationCriteria = {};
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

function formatAmount(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return amount;
  }
  return Number.isInteger(value)
    ? currencyFormatter.format(value)
    : currencyWithCentsFormatter.format(value);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateFormatter.format(date);
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  // The PDF only lives in the browser's memory: it is never stored on the
  // server (business rule confirmed with the client).
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoked after the click so Safari doesn't cut the download short.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ConsultaPublicaPage() {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState>({ kind: "idle" });
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
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
    setDownloadError(null);
    setSearch({ kind: "loading" });

    try {
      const result = await consultSettlements(criteria, controller.signal);
      if (result.settlements.length === 0) {
        setSearch({ kind: "not-found" });
      } else {
        setSearch({ kind: "found", result, criteria });
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      // 404 = no exact match. Shown the same as "no results", without
      // saying which field failed (RNF-04: no hints or suggestions that
      // would let someone guess third parties' data).
      if (error instanceof ApiError && error.status === 404) {
        setSearch({ kind: "not-found" });
        return;
      }
      setSearch({ kind: "error", message: getErrorMessage(error) });
    }
  }

  function handleClear() {
    abortRef.current?.abort();
    setValues(EMPTY_FORM);
    setFormError(null);
    setDownloadError(null);
    setSearch({ kind: "idle" });
  }

  async function handleDownload(
    settlement: PublicSettlement,
    criteria: PublicConsultationCriteria,
    cadastralCode: string,
  ) {
    setDownloadingId(settlement.id);
    setDownloadError(null);
    try {
      const { blob, fileName } = await downloadSettlementPdf(
        criteria,
        settlement.id,
      );
      triggerBrowserDownload(
        blob,
        fileName ?? `liquidacion-${cadastralCode}-${settlement.period}.pdf`,
      );
    } catch (error) {
      setDownloadError(
        `No se pudo descargar la liquidación del periodo ${settlement.period}. ${getErrorMessage(error)}`,
      );
    } finally {
      setDownloadingId(null);
    }
  }

  function renderDownloadButton(
    settlement: PublicSettlement,
    criteria: PublicConsultationCriteria,
    cadastralCode: string,
    fullWidth = false,
  ) {
    return (
      <Button
        key="pdf"
        variant="secondary"
        fullWidth={fullWidth}
        loading={downloadingId === settlement.id}
        disabled={downloadingId !== null && downloadingId !== settlement.id}
        onClick={() => handleDownload(settlement, criteria, cadastralCode)}
        aria-label={`Descargar PDF de la liquidación del periodo ${settlement.period}`}
      >
        Descargar PDF
      </Button>
    );
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
            Consulta y descarga las liquidaciones oficiales vigentes de tu
            predio. No necesitas crear una cuenta.
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
                Liquidaciones vigentes
              </h2>

              <dl className="consulta-publica__property">
                <div>
                  <dt>Cédula catastral</dt>
                  <dd>{search.result.property.cadastralCode}</dd>
                </div>
                <div>
                  <dt>Dirección</dt>
                  <dd>{search.result.property.address}</dd>
                </div>
                <div>
                  <dt>Liquidaciones encontradas</dt>
                  <dd>{search.result.settlements.length}</dd>
                </div>
              </dl>

              {downloadError && (
                <p
                  className="consulta-publica__message consulta-publica__message--danger"
                  role="alert"
                >
                  {downloadError}
                </p>
              )}

              {/* Desktop: table. Mobile: stacked cards, so the download
                  button (the taxpayer's main action) is never hidden behind
                  a horizontal scroll. */}
              <div className="consulta-publica__table">
                <Table
                  columns={[
                    "Periodo",
                    "Fecha de expedición",
                    "Valor total",
                    "Estado",
                    "PDF",
                  ]}
                >
                  {search.result.settlements.map((settlement) => (
                    <TableRow
                      key={settlement.id}
                      cells={[
                        settlement.period,
                        formatDate(settlement.issuedAt),
                        formatAmount(settlement.totalAmount),
                        <StatusBadge key="estado" variant="success">
                          Vigente
                        </StatusBadge>,
                        renderDownloadButton(
                          settlement,
                          search.criteria,
                          search.result.property.cadastralCode,
                        ),
                      ]}
                    />
                  ))}
                </Table>
              </div>

              <ul className="consulta-publica__list">
                {search.result.settlements.map((settlement) => (
                  <li key={settlement.id} className="consulta-publica__item">
                    <div className="consulta-publica__item-head">
                      <span className="consulta-publica__item-period">
                        Periodo {settlement.period}
                      </span>
                      <StatusBadge variant="success">Vigente</StatusBadge>
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
                    {renderDownloadButton(
                      settlement,
                      search.criteria,
                      search.result.property.cadastralCode,
                      true,
                    )}
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
