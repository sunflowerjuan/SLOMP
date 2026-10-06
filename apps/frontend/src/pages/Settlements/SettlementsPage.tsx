import { useState } from "react";
import type { FormEvent } from "react";
import { getErrorMessage } from "../../api/ApiError";
import { messageForErrorCode } from "../../api/errorMessages";
import {
  changeSettlementStatus,
  generateLiquidationPdf,
  searchSettlements,
} from "../../api/settlements";
import type { SettlementSearchResult } from "../../api/settlements";
import { triggerBrowserDownload } from "../../utils/downloadBlob";
import { formatPeriods } from "../../utils/formatPeriods";
import type { SettlementStatus } from "../../domain/settlementStatus";
import { Button } from "../../components/ui/Button";
import { GeneratePdfDialog } from "../../components/ui/GeneratePdfDialog";
import { Input } from "../../components/ui/Input";
import { Table } from "../../components/ui/Table";
import { TableRow } from "../../components/ui/TableRow";
import { SettlementStatusCell } from "./SettlementStatusCell";
import "./SettlementsPage.css";

interface Filters {
  cedulaCatastral: string;
  propietario: string;
  direccion: string;
}

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const EMPTY_FILTERS: Filters = {
  cedulaCatastral: "",
  propietario: "",
  direccion: "",
};

export function SettlementsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<SettlementSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedSettlementId, setSelectedSettlementId] = useState<
    number | null
  >(null);
  const [pdfDialogLiquidacion, setPdfDialogLiquidacion] =
    useState<SettlementSearchResult | null>(null);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [statusChangeId, setStatusChangeId] = useState<number | null>(null);
  const [statusChangeError, setStatusChangeError] = useState<string | null>(
    null,
  );

  function handleFilterChange(field: keyof Filters, value: string) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cedulaCatastral = filters.cedulaCatastral.trim();
    const propietario = filters.propietario.trim();
    const direccion = filters.direccion.trim();

    if (!cedulaCatastral && !propietario && !direccion) {
      setSearchError(
        messageForErrorCode("SETTLEMENT_SEARCH_CRITERIA_REQUIRED"),
      );
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    try {
      const found = await searchSettlements({
        cadastralCode: cedulaCatastral,
        owner: propietario,
        address: direccion,
      });
      setResults(found);
      setHasSearched(true);
      setSelectedSettlementId(null);
      setEditingId(null);
    } catch (caught) {
      setSearchError(getErrorMessage(caught));
    } finally {
      setIsSearching(false);
    }
  }

  async function handleStatusChange(
    entry: SettlementSearchResult,
    status: SettlementStatus,
  ) {
    if (status === entry.status) {
      setEditingId(null);
      return;
    }

    setStatusChangeId(entry.settlementId);
    setStatusChangeError(null);
    try {
      await changeSettlementStatus(entry.settlementId, status);
      setResults((current) =>
        current.map((row) =>
          row.settlementId === entry.settlementId ? { ...row, status } : row,
        ),
      );
      setEditingId(null);
    } catch (caught) {
      setStatusChangeError(getErrorMessage(caught));
    } finally {
      setStatusChangeId(null);
    }
  }

  function handleRowClick(entry: SettlementSearchResult) {
    setSelectedSettlementId(entry.settlementId);
    setPdfDialogLiquidacion(entry);
    setPdfError(null);
    setIsPdfDialogOpen(true);
  }

  function handleCancelPdfDialog() {
    setIsPdfDialogOpen(false);
  }

  async function handleGeneratePdf() {
    if (!pdfDialogLiquidacion) return;

    setIsGeneratingPdf(true);
    setPdfError(null);
    try {
      const { blob, fileName } = await generateLiquidationPdf(
        pdfDialogLiquidacion.settlementId,
      );
      triggerBrowserDownload(blob, fileName ?? "liquidacion.pdf");
      setIsPdfDialogOpen(false);
    } catch (caught) {
      setPdfError(getErrorMessage(caught));
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  return (
    <div className="settlements-page">
      <header className="settlements-page__header">
        <h1 className="settlements-page__title">Panel de liquidaciones</h1>
        <p className="settlements-page__subtitle">
          Consulta, filtra y genera las liquidaciones oficiales del predio.
        </p>
      </header>

      <section className="settlements-page__card">
        <h2 className="settlements-page__card-title">Filtros de búsqueda</h2>
        <p className="settlements-page__card-subtitle">
          Al menos un criterio permite ubicar las liquidaciones del predio.
        </p>

        <form className="settlements-page__filters" onSubmit={handleSearch}>
          <div className="settlements-page__filter-field">
            <Input
              label="Cédula catastral"
              placeholder="000-00-0000-000"
              value={filters.cedulaCatastral}
              onChange={(event) =>
                handleFilterChange("cedulaCatastral", event.target.value)
              }
            />
          </div>
          <div className="settlements-page__filter-field">
            <Input
              label="Propietario"
              placeholder="Nombre del propietario"
              value={filters.propietario}
              onChange={(event) =>
                handleFilterChange("propietario", event.target.value)
              }
            />
          </div>
          <div className="settlements-page__filter-field">
            <Input
              label="Dirección del predio"
              placeholder="Calle 00 # 00-00"
              value={filters.direccion}
              onChange={(event) =>
                handleFilterChange("direccion", event.target.value)
              }
            />
          </div>
          <div className="settlements-page__filter-action">
            <Button type="submit" loading={isSearching}>
              Buscar
            </Button>
          </div>
        </form>

        {searchError && (
          <p className="settlements-page__error" role="alert">
            {searchError}
          </p>
        )}
      </section>

      {hasSearched && (
        <section className="settlements-page__card">
          <h2 className="settlements-page__card-title">Resultados</h2>
          <p className="settlements-page__card-subtitle">
            {results.length} liquidaciones encontradas para los criterios
            ingresados.
          </p>

          {statusChangeError && (
            <p className="settlements-page__error" role="alert">
              {statusChangeError}
            </p>
          )}

          <Table
            columns={[
              "Cédula catastral",
              "Propietario",
              "Periodos",
              "Total",
              "Estado",
            ]}
          >
            {results.map((entry) => (
              <TableRow
                key={entry.settlementId}
                selected={entry.settlementId === selectedSettlementId}
                onClick={() => handleRowClick(entry)}
                cells={[
                  entry.cadastralCode,
                  entry.ownerName,
                  formatPeriods(entry.periods),
                  COP.format(entry.totalAmount),
                  <SettlementStatusCell
                    key="estado"
                    status={entry.status}
                    description={`${entry.cadastralCode}, periodos ${formatPeriods(entry.periods)}`}
                    editing={editingId === entry.settlementId}
                    saving={statusChangeId === entry.settlementId}
                    editLocked={editingId !== null}
                    onEdit={() => {
                      setEditingId(entry.settlementId);
                      setStatusChangeError(null);
                    }}
                    onSave={(status) => handleStatusChange(entry, status)}
                    onCancel={() => {
                      setEditingId(null);
                      setStatusChangeError(null);
                    }}
                  />,
                ]}
              />
            ))}
          </Table>
        </section>
      )}

      <GeneratePdfDialog
        open={isPdfDialogOpen}
        liquidacion={
          pdfDialogLiquidacion
            ? {
                cedulaCatastral: pdfDialogLiquidacion.cadastralCode,
                propietario: pdfDialogLiquidacion.ownerName,
              }
            : null
        }
        isGenerating={isGeneratingPdf}
        error={pdfError}
        onCancel={handleCancelPdfDialog}
        onGenerate={handleGeneratePdf}
      />
    </div>
  );
}
