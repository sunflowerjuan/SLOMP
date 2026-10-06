import { useEffect, useState } from "react";
import { getErrorMessage } from "../../api/ApiError";
import { messageForRowIssue } from "../../api/errorMessages";
import { importTaxRoll, listTaxRollImports } from "../../api/taxRoll";
import { BulkZipPanel } from "./BulkZipPanel";
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
import "./TaxRollUploadPage.css";

// How many problem rows get listed before summarizing the rest.
const MAX_LISTED_ISSUES = 10;

const DATE_FORMATTER = new Intl.DateTimeFormat("es-CO", {
  dateStyle: "short",
  timeStyle: "short",
});

// The backend doesn't store a "status" per upload (tax_roll_imports only
// has counts); it's derived here, with the same criteria as the result
// section of a just-finished upload.
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

export function TaxRollUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConfirmingReplace, setIsConfirmingReplace] = useState(false);
  const [isReplaceDialogOpen, setIsReplaceDialogOpen] = useState(false);
  const [result, setResult] = useState<TaxRollImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<TaxRollImportHistoryEntry[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);

  // isHistoryLoading starts true (useState above) for the first fetch; it's
  // not set back to true on later refreshes (after an import) so the table
  // already on screen doesn't get hidden.
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
    // refreshHistory isn't reused here: this lint rule requires an effect
    // to not synchronously trigger a setState in its body, and
    // refreshHistory starts by synchronously clearing the error.
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
      // refreshHistory() handles its own errors (historyError state) and
      // never rejects -- intentionally fire-and-forget.
      void refreshHistory();
      // The backend leaves properties/periods that already had a current
      // settlement untouched and reports them in `conflicts`.
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
      // Passes the importId of the upload that reported the conflicts so
      // the backend updates that same history entry instead of leaving it
      // as "With conflicts" and creating a separate new one.
      setResult(await importTaxRoll(file, true, result?.importId));
      void refreshHistory();
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
    <div className="tax-roll-upload-page">
      <header className="tax-roll-upload-page__header">
        <h1 className="tax-roll-upload-page__title">Carga de archivo Excel</h1>
        <p className="tax-roll-upload-page__subtitle">
          Sube el Excel con la información de predios y deudas para generar las
          liquidaciones del periodo actual.
        </p>
      </header>

      <div className="tax-roll-upload-page__layout">
        <div className="tax-roll-upload-page__main">
          <section className="tax-roll-upload-page__card tax-roll-upload-page__upload">
            <h2 className="tax-roll-upload-page__card-title">Nueva carga</h2>
            <p className="tax-roll-upload-page__card-subtitle">
              Cada predio y periodo solo puede liquidarse una vez. Si el periodo
              ya fue liquidado, el sistema te avisará antes de reemplazarlo.
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
              <p className="tax-roll-upload-page__error" role="alert">
                {error}
              </p>
            )}

            <div className="tax-roll-upload-page__actions">
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
            <div className="tax-roll-upload-page__result-reveal">
              <section
                className="tax-roll-upload-page__card tax-roll-upload-page__result"
                aria-live="polite"
              >
                <h2 className="tax-roll-upload-page__card-title">
                  Resultado de la carga
                </h2>
                <ul className="tax-roll-upload-page__summary">
                  <li>
                    <strong>{result.persisted.settlements}</strong>{" "}
                    liquidaciones generadas
                  </li>
                  <li>
                    <strong>{result.persisted.properties}</strong> predios y{" "}
                    <strong>{result.persisted.owners}</strong> propietarios
                    procesados
                  </li>
                  {conflictCount > 0 && (
                    <li>
                      <strong>{conflictCount}</strong> predios y periodos ya
                      tenían una liquidación y no se modificaron
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
                <IssueList
                  title="Filas inválidas"
                  issues={result.invalidRows}
                />
                <IssueList title="Advertencias" issues={result.warnings} />
              </section>
            </div>
          )}

          <section className="tax-roll-upload-page__card tax-roll-upload-page__history">
            <h2 className="tax-roll-upload-page__card-title">
              Historial de cargas
            </h2>
            <p className="tax-roll-upload-page__card-subtitle">
              Últimos archivos procesados por el sistema.
            </p>

            {historyError && (
              <p className="tax-roll-upload-page__error" role="alert">
                {historyError}
              </p>
            )}

            {!historyError && !isHistoryLoading && history.length === 0 && (
              <p className="tax-roll-upload-page__card-subtitle">
                Todavía no se ha procesado ningún archivo.
              </p>
            )}

            {history.length > 0 && (
              <Table
                columns={["Archivo", "Fecha de carga", "Registros", "Estado"]}
              >
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
        </div>
        <BulkZipPanel refreshKey={result?.importId} />
      </div>

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
    <div className="tax-roll-upload-page__issues">
      <h3 className="tax-roll-upload-page__issues-title">{title}</h3>
      <ul>
        {listed.map((issue) => (
          <li key={`${issue.row}-${issue.code}`}>
            {messageForRowIssue(issue)}
          </li>
        ))}
        {hidden > 0 && <li>y {hidden} más…</li>}
      </ul>
    </div>
  );
}
