import { useState } from "react";
import type { FormEvent } from "react";
import { getErrorMessage } from "../../api/ApiError";
import {
  changeSettlementStatus,
  searchSettlements,
} from "../../api/settlements";
import type { SettlementSearchResult } from "../../api/settlements";
import {
  SETTLEMENT_STATUSES,
  SETTLEMENT_STATUS_LABEL,
  SETTLEMENT_STATUS_VARIANT,
} from "../../domain/settlementStatus";
import type { SettlementStatus } from "../../domain/settlementStatus";
import { Button } from "../../components/ui/Button";
import { GeneratePdfDialog } from "../../components/ui/GeneratePdfDialog";
import { Input } from "../../components/ui/Input";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table } from "../../components/ui/Table";
import { TableRow } from "../../components/ui/TableRow";
import "./LiquidacionesPage.css";

interface Filters {
  cedulaCatastral: string;
  propietario: string;
  direccion: string;
}

const EMPTY_FILTERS: Filters = {
  cedulaCatastral: "",
  propietario: "",
  direccion: "",
};

export function LiquidacionesPage() {
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
        "Ingresa al menos un criterio (cédula catastral, propietario o dirección).",
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
    if (status === entry.status) return;

    setStatusChangeId(entry.settlementId);
    setStatusChangeError(null);
    try {
      await changeSettlementStatus(entry.settlementId, status);
      setResults((current) =>
        current.map((row) =>
          row.settlementId === entry.settlementId ? { ...row, status } : row,
        ),
      );
    } catch (caught) {
      setStatusChangeError(getErrorMessage(caught));
    } finally {
      setStatusChangeId(null);
    }
  }

  function handleRowClick(entry: SettlementSearchResult) {
    setSelectedSettlementId(entry.settlementId);
    setPdfDialogLiquidacion(entry);
    setIsPdfDialogOpen(true);
  }

  function handleCancelPdfDialog() {
    setIsPdfDialogOpen(false);
  }

  function handleGeneratePdf() {
    setIsGeneratingPdf(true);
    // TODO(SL-50/SL-51): conectar con el endpoint real de generacion de PDF
    // (plantilla .docx marcada + LibreOffice headless) cuando exista -- esas
    // tareas todavia no estan hechas. El setTimeout de abajo solo simula la
    // carga en el cliente, no genera ni descarga ningun archivo real.
    setTimeout(() => {
      setIsGeneratingPdf(false);
      setIsPdfDialogOpen(false);
    }, 700);
  }

  return (
    <div className="liquidaciones-page">
      <header className="liquidaciones-page__header">
        <h1 className="liquidaciones-page__title">Panel de liquidaciones</h1>
        <p className="liquidaciones-page__subtitle">
          Consulta, filtra y genera las liquidaciones oficiales del predio.
        </p>
      </header>

      <section className="liquidaciones-page__card">
        <h2 className="liquidaciones-page__card-title">Filtros de búsqueda</h2>
        <p className="liquidaciones-page__card-subtitle">
          Al menos un criterio permite ubicar las liquidaciones del predio.
        </p>

        <form className="liquidaciones-page__filters" onSubmit={handleSearch}>
          <div className="liquidaciones-page__filter-field">
            <Input
              label="Cédula catastral"
              placeholder="000-00-0000-000"
              value={filters.cedulaCatastral}
              onChange={(event) =>
                handleFilterChange("cedulaCatastral", event.target.value)
              }
            />
          </div>
          <div className="liquidaciones-page__filter-field">
            <Input
              label="Propietario"
              placeholder="Nombre del propietario"
              value={filters.propietario}
              onChange={(event) =>
                handleFilterChange("propietario", event.target.value)
              }
            />
          </div>
          <div className="liquidaciones-page__filter-field">
            <Input
              label="Dirección del predio"
              placeholder="Calle 00 # 00-00"
              value={filters.direccion}
              onChange={(event) =>
                handleFilterChange("direccion", event.target.value)
              }
            />
          </div>
          <div className="liquidaciones-page__filter-action">
            <Button type="submit" loading={isSearching}>
              Buscar
            </Button>
          </div>
        </form>

        {searchError && (
          <p className="liquidaciones-page__error" role="alert">
            {searchError}
          </p>
        )}
      </section>

      {hasSearched && (
        <section className="liquidaciones-page__card">
          <h2 className="liquidaciones-page__card-title">Resultados</h2>
          <p className="liquidaciones-page__card-subtitle">
            {results.length} liquidaciones encontradas para los criterios
            ingresados.
          </p>

          {statusChangeError && (
            <p className="liquidaciones-page__error" role="alert">
              {statusChangeError}
            </p>
          )}

          <Table
            columns={["Cédula catastral", "Propietario", "Periodo", "Estado"]}
          >
            {results.map((entry) => (
              <TableRow
                key={entry.settlementId}
                selected={entry.settlementId === selectedSettlementId}
                onClick={() => handleRowClick(entry)}
                cells={[
                  entry.cadastralCode,
                  entry.ownerName,
                  entry.period,
                  <div
                    key="estado"
                    className="liquidaciones-page__status-cell"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <StatusBadge
                      variant={SETTLEMENT_STATUS_VARIANT[entry.status]}
                    >
                      {SETTLEMENT_STATUS_LABEL[entry.status]}
                    </StatusBadge>
                    <select
                      aria-label={`Cambiar estado de la liquidación de ${entry.cadastralCode}, periodo ${entry.period}`}
                      className="liquidaciones-page__status-select"
                      value={entry.status}
                      disabled={statusChangeId === entry.settlementId}
                      onChange={(event) =>
                        handleStatusChange(
                          entry,
                          event.target.value as SettlementStatus,
                        )
                      }
                    >
                      {SETTLEMENT_STATUSES.map((estado) => (
                        <option key={estado} value={estado}>
                          {SETTLEMENT_STATUS_LABEL[estado]}
                        </option>
                      ))}
                    </select>
                  </div>,
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
        onCancel={handleCancelPdfDialog}
        onGenerate={handleGeneratePdf}
      />
    </div>
  );
}
