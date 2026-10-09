import { useEffect, useState } from "react";
import { getErrorMessage } from "../../api/ApiError";
import { importTaxRoll, listTaxRollImports } from "../../api/taxRoll";
import { BulkZipPanel } from "./BulkZipPanel";
import { TaxRollIssueList } from "./TaxRollIssueList";
import { TaxRollStat } from "./TaxRollStat";
import type {
  TaxRollImportHistoryEntry,
  TaxRollImportResult,
} from "../../api/taxRoll";
import { Button } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/CloseIcon";
import { Card } from "../../components/ui/Card";
import { Dropzone } from "../../components/ui/Dropzone";
import { Notice } from "../../components/ui/Notice";
import { useSwipeToDismiss } from "../../hooks/useSwipeToDismiss";
import { PageHeader } from "../../components/ui/PageHeader";
import { ReplaceConfirmDialog } from "../../components/ui/ReplaceConfirmDialog";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { Table } from "../../components/ui/Table";
import { TableRow } from "../../components/ui/TableRow";
import "./TaxRollUploadPage.css";

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

  // How the result card leaves: faded by its close button, or swiped away
  // to one side. The card is removed once that exit animation ends.
  const [leaving, setLeaving] = useState<"fade" | 1 | -1 | null>(null);
  const { ref: resultRef, bind: swipeBind } =
    useSwipeToDismiss<HTMLDivElement>(setLeaving);

  function resetOutcome() {
    setResult(null);
    setError(null);
    setLeaving(null);
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

  const resultImportId = result?.importId;
  useEffect(() => {
    // Announce the outcome: move focus to the result region.
    if (resultImportId !== undefined) {
      resultRef.current?.focus({ preventScroll: true });
    }
  }, [resultImportId, resultRef]);

  const conflictCount = result?.persisted.conflicts.length ?? 0;

  return (
    <div className="page tax-roll-upload-page">
      <PageHeader title="Carga de Excel" />

      <div className="tax-roll-upload-page__layout">
        <div className="tax-roll-upload-page__main">
          <Card title="Nueva carga" className="tax-roll-upload-page__upload">
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

            {error && <Notice>{error}</Notice>}

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
          </Card>

          <Card
            title="Historial de cargas"
            subtitle="Últimos archivos procesados por el sistema."
            className="tax-roll-upload-page__history"
          >
            {historyError && <Notice>{historyError}</Notice>}

            {isHistoryLoading && (
              <p className="tax-roll-upload-page__muted" role="status">
                Cargando historial…
              </p>
            )}

            {!historyError && !isHistoryLoading && history.length === 0 && (
              <p className="tax-roll-upload-page__muted">
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
          </Card>
        </div>
        <div className="tax-roll-upload-page__side">
          {result && (
            <div
              ref={resultRef}
              className="tax-roll-upload-page__result-reveal"
              data-leaving={leaving === null ? undefined : String(leaving)}
              onAnimationEnd={(event) => {
                if (event.animationName.startsWith("tax-roll-result-leave")) {
                  resetOutcome();
                }
              }}
              {...swipeBind}
              role="region"
              aria-label="Resultado de la carga"
              tabIndex={-1}
            >
              <Card
                title="Resultado de la carga"
                className="tax-roll-upload-page__result"
                action={
                  <button
                    type="button"
                    className="tax-roll-upload-page__close"
                    aria-label="Cerrar resultado de la carga"
                    onClick={() => setLeaving("fade")}
                  >
                    <CloseIcon />
                  </button>
                }
              >
                <dl className="tax-roll-upload-page__stats">
                  <TaxRollStat
                    value={result.persisted.settlements}
                    label="liquidaciones generadas"
                  />
                  <TaxRollStat
                    value={result.persisted.properties}
                    label="predios procesados"
                  />
                  <TaxRollStat
                    value={result.persisted.owners}
                    label="propietarios procesados"
                  />
                  <TaxRollStat
                    value={result.invalidRows.length}
                    label="filas inválidas omitidas"
                    tone={result.invalidRows.length > 0 ? "danger" : undefined}
                  />
                  <TaxRollStat
                    value={result.warnings.length}
                    label="con advertencias"
                    tone={result.warnings.length > 0 ? "warning" : undefined}
                  />
                </dl>
                {conflictCount > 0 && (
                  <Notice variant="info">
                    {conflictCount} predios y periodos ya tenían una liquidación
                    y no se modificaron.{" "}
                    {!isReplaceDialogOpen && (
                      <Button
                        variant="secondary"
                        onClick={() => setIsReplaceDialogOpen(true)}
                      >
                        Reemplazar
                      </Button>
                    )}
                  </Notice>
                )}
                <TaxRollIssueList
                  title="Filas inválidas"
                  issues={result.invalidRows}
                />
                <TaxRollIssueList
                  title="Advertencias"
                  issues={result.warnings}
                />
              </Card>
            </div>
          )}
          <BulkZipPanel refreshKey={result?.importId} />
        </div>
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
