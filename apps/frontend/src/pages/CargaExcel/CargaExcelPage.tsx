import { useEffect, useState } from "react";
import { getErrorMessage } from "../../api/ApiError";
import { importTaxRoll, listTaxRollImports } from "../../api/taxRoll";
import type {
  TaxRollImportHistoryEntry,
  TaxRollImportResult,
} from "../../api/taxRoll";
import { Button } from "../../components/ui/Button";
import { Dropzone } from "../../components/ui/Dropzone";
import { ReplaceConfirmDialog } from "../../components/ui/ReplaceConfirmDialog";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table } from "../../components/ui/Table";
import { TableRow } from "../../components/ui/TableRow";
import "./CargaExcelPage.css";

// Cuantas filas con problemas se listan antes de resumir el resto.
const MAX_LISTED_ISSUES = 10;

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
});

// El backend no guarda un "estado" por carga (tax_roll_imports solo tiene
// conteos); se deriva aqui, con el mismo criterio que la seccion de
// resultado de una carga recien hecha.
function historyEntryStatus(entry: TaxRollImportHistoryEntry) {
  if (entry.invalidRows > 0) {
    return { label: "Con filas inválidas", variant: "danger" as const };
  }
  if (entry.conflicts > 0) {
    return { label: "Con conflictos", variant: "warning" as const };
  }
  if (entry.warnings > 0) {
    return { label: "Con advertencias", variant: "warning" as const };
  }
  return { label: "Procesado", variant: "success" as const };
}

export function CargaExcelPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmingReplace, setIsConfirmingReplace] = useState(false);
  const [isReplaceDialogOpen, setIsReplaceDialogOpen] = useState(false);
  const [result, setResult] = useState<TaxRollImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<TaxRollImportHistoryEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  // isHistoryLoading arranca en true (useState arriba) para el primer
  // fetch; no se vuelve a poner en true en refrescos posteriores (tras un
  // import) para no ocultar la tabla que ya esta en pantalla.
  async function refreshHistory() {
    setHistoryError(null);
    try {
      setHistory(await listTaxRollImports());
    } catch (caught) {
      setHistoryError(getErrorMessage(caught));
    } finally {
      setIsHistoryLoading(false);
    }
  }

  useEffect(() => {
    // No se reusa refreshHistory aqui: esta regla de lint exige que un
    // efecto no dispare un setState de forma sincrona en su cuerpo, y
    // refreshHistory empieza por limpiar el error de forma sincrona.
    listTaxRollImports()
      .then(setHistory)
      .catch((caught: unknown) => setHistoryError(getErrorMessage(caught)))
      .finally(() => setIsHistoryLoading(false));
  }, []);

  function resetOutcome() {
    setResult(null);
    setError(null);
  }

  async function handleProcess() {
    if (!file) {
      return;
    }

    resetOutcome();
    setIsProcessing(true);
    try {
      const response = await importTaxRoll(file, false);
      setResult(response);
      refreshHistory();
      // El backend deja sin tocar los predios/periodos que ya tenian una
      // liquidacion vigente y los reporta en `conflicts` (HU18).
      if (response.persisted.conflicts.length > 0) {
        setIsReplaceDialogOpen(true);
      }
    } catch (caught) {
      setError(getErrorMessage(caught));
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleConfirmReplace() {
    if (!file) {
      return;
    }

    setError(null);
    setIsConfirmingReplace(true);
    try {
      // Se pasa el importId de la carga que reporto los conflictos para
      // que el backend actualice ese mismo registro del historial en vez
      // de dejarlo como "Con conflictos" y crear uno nuevo aparte.
      setResult(await importTaxRoll(file, true, result?.importId));
      refreshHistory();
      setIsReplaceDialogOpen(false);
    } catch (caught) {
      setIsReplaceDialogOpen(false);
      setError(getErrorMessage(caught));
    } finally {
      setIsConfirmingReplace(false);
    }
  }

  const conflictCount = result?.persisted.conflicts.length ?? 0;

  return (
    <div className="carga-excel-page">
      <header className="carga-excel-page__header">
        <h1 className="carga-excel-page__title">Carga de archivo Excel</h1>
        <p className="carga-excel-page__subtitle">
          Sube el Excel con la información de predios y deudas para generar las
          liquidaciones del periodo actual.
        </p>
      </header>

      <section className="carga-excel-page__card">
        <h2 className="carga-excel-page__card-title">Nueva carga</h2>
        <p className="carga-excel-page__card-subtitle">
          Cada predio y periodo solo puede liquidarse una vez. Si el periodo ya
          fue liquidado, el sistema te avisará antes de reemplazarlo.
        </p>

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

        {error && (
          <p className="carga-excel-page__error" role="alert">
            {error}
          </p>
        )}

        <div className="carga-excel-page__actions">
          <Button
            type="button"
            disabled={!file}
            loading={isProcessing}
            onClick={handleProcess}
          >
            Procesar archivo
          </Button>
        </div>
      </section>

      {result && (
        <section className="carga-excel-page__card" aria-live="polite">
          <h2 className="carga-excel-page__card-title">
            Resultado de la carga
          </h2>
          <ul className="carga-excel-page__summary">
            <li>
              <strong>{result.persisted.settlements}</strong> liquidaciones
              generadas
            </li>
            <li>
              <strong>{result.persisted.properties}</strong> predios y{" "}
              <strong>{result.persisted.owners}</strong> propietarios procesados
            </li>
            {conflictCount > 0 && (
              <li>
                <strong>{conflictCount}</strong> predios y periodos ya tenían
                una liquidación y no se modificaron
                {!isReplaceDialogOpen && (
                  <>
                    {" "}
                    <Button
                      variant="secondary"
                      onClick={() => setIsReplaceDialogOpen(true)}
                    >
                      Reemplazar
                    </Button>
                  </>
                )}
              </li>
            )}
            <li>
              <strong>{result.invalidRows.length}</strong> filas inválidas
              omitidas, <strong>{result.warnings.length}</strong> con
              advertencias
            </li>
          </ul>
          <IssueList title="Filas inválidas" issues={result.invalidRows} />
          <IssueList title="Advertencias" issues={result.warnings} />
        </section>
      )}

      <section className="carga-excel-page__card">
        <h2 className="carga-excel-page__card-title">Historial de cargas</h2>
        <p className="carga-excel-page__card-subtitle">
          Últimos archivos procesados por el sistema.
        </p>

        {historyError && (
          <p className="carga-excel-page__error" role="alert">
            {historyError}
          </p>
        )}

        {!historyError && !isHistoryLoading && history.length === 0 && (
          <p className="carga-excel-page__card-subtitle">
            Todavía no se ha procesado ningún archivo.
          </p>
        )}

        {history.length > 0 && (
          <Table columns={["Archivo", "Fecha de carga", "Registros", "Estado"]}>
            {history.map((entry) => {
              const status = historyEntryStatus(entry);
              return (
                <TableRow
                  key={entry.id}
                  cells={[
                    entry.fileName,
                    DATE_FORMATTER.format(new Date(entry.importedAt)),
                    entry.validRows + entry.invalidRows,
                    <StatusBadge key="estado" variant={status.variant}>
                      {status.label}
                    </StatusBadge>,
                  ]}
                />
              );
            })}
          </Table>
        )}
      </section>

      <ReplaceConfirmDialog
        open={isReplaceDialogOpen}
        isConfirming={isConfirmingReplace}
        onCancel={() => setIsReplaceDialogOpen(false)}
        onConfirm={handleConfirmReplace}
      />
    </div>
  );
}

function IssueList({
  title,
  issues,
}: {
  title: string;
  issues: TaxRollImportResult["invalidRows"];
}) {
  if (issues.length === 0) {
    return null;
  }

  const listed = issues.slice(0, MAX_LISTED_ISSUES);
  const hidden = issues.length - listed.length;

  return (
    <div className="carga-excel-page__issues">
      <h3 className="carga-excel-page__issues-title">{title}</h3>
      <ul>
        {listed.map((issue) => (
          <li key={`${issue.row}-${issue.reason}`}>
            Fila {issue.row}: {issue.reason}
          </li>
        ))}
        {hidden > 0 && <li>y {hidden} más…</li>}
      </ul>
    </div>
  );
}
