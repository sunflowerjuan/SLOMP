import { useEffect, useState } from "react";
import { getErrorMessage } from "../../api/ApiError";
import { messageForErrorCode } from "../../api/errorMessages";
import {
  changeSettlementStatus,
  generateLiquidationPdf,
  searchSettlements,
} from "../../api/settlements";
import type { SettlementSearchResult } from "../../api/settlements";
import { SETTLEMENT_STATUS_LABEL } from "../../domain/settlementStatus";
import type { SettlementStatus } from "../../domain/settlementStatus";
import { GeneratePdfDialog } from "../../components/ui/GeneratePdfDialog";
import { Notice } from "../../components/ui/Notice";
import { PageHeader } from "../../components/ui/PageHeader";
import { Toast } from "../../components/ui/Toast";
import { triggerBrowserDownload } from "../../utils/downloadBlob";
import { SettlementDetailSheet } from "./SettlementDetailSheet";
import { SettlementList } from "./SettlementList";
import type { ListState } from "./SettlementList";
import { SettlementSearchBar } from "./SettlementSearchBar";
import type { SearchField } from "./SettlementSearchBar";
import "./SettlementsPage.css";

const DETAIL_ID = "settlement-detail";
const TOAST_MS = 2400;

type Editing = { id: number; where: "row" | "sheet" } | null;

export function SettlementsPage() {
  const [field, setField] = useState<SearchField>("cadastralCode");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SettlementSearchResult[]>([]);
  const [listState, setListState] = useState<ListState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  // The sheet keeps showing the last selection while it slides out.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetEntryId, setSheetEntryId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [statusChangeId, setStatusChangeId] = useState<number | null>(null);
  const [statusChangeError, setStatusChangeError] = useState<string | null>(
    null,
  );
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const sheetEntry =
    results.find((entry) => entry.settlementId === sheetEntryId) ?? null;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  function closeSheet() {
    const id = selectedId;
    setSelectedId(null);
    setEditing(null);
    // Back to the row that opened it.
    setTimeout(() =>
      document.querySelector<HTMLElement>(`[data-rowlink="${id}"]`)?.focus(),
    );
  }

  useEffect(() => {
    if (selectedId === null) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isPdfDialogOpen) closeSheet();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  async function handleSearch() {
    const text = query.trim();
    if (!text) {
      setSearchError(
        messageForErrorCode("SETTLEMENT_SEARCH_CRITERIA_REQUIRED"),
      );
      return;
    }

    setListState("loading");
    setSearchError(null);
    setStatusChangeError(null);
    setSelectedId(null);
    setSheetEntryId(null);
    setEditing(null);
    try {
      const found = await searchSettlements({ [field]: text });
      setResults(found);
      setListState(found.length ? "results" : "empty");
    } catch (caught) {
      setSearchError(getErrorMessage(caught));
      setListState("idle");
    }
  }

  function handleFieldChange(next: SearchField) {
    setField(next);
    setQuery("");
  }

  function handleToggle(id: number) {
    if (selectedId === id) {
      closeSheet();
      return;
    }
    setSelectedId(id);
    setSheetEntryId(id);
    setEditing(null);
    setStatusChangeError(null);
  }

  async function handleStatusChange(
    entry: SettlementSearchResult,
    status: SettlementStatus,
  ) {
    if (status === entry.status) {
      setEditing(null);
      setToast("El estado no cambió.");
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
      setEditing(null);
      setToast(`Estado actualizado a «${SETTLEMENT_STATUS_LABEL[status]}».`);
    } catch (caught) {
      setStatusChangeError(getErrorMessage(caught));
    } finally {
      setStatusChangeId(null);
    }
  }

  async function handleGeneratePdf() {
    if (!sheetEntry) return;

    setIsGeneratingPdf(true);
    setPdfError(null);
    try {
      const { blob, fileName } = await generateLiquidationPdf(
        sheetEntry.settlementId,
      );
      triggerBrowserDownload(blob, fileName ?? "liquidacion.pdf");
      setIsPdfDialogOpen(false);
      setToast("PDF generado. La descarga comenzó.");
    } catch (caught) {
      setPdfError(getErrorMessage(caught));
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  const countText =
    listState === "results" || listState === "empty"
      ? `${results.length} ${results.length === 1 ? "liquidación" : "liquidaciones"}`
      : "";

  return (
    <div
      className="page settlements-page"
      data-sheet={selectedId !== null ? "open" : "closed"}
    >
      <PageHeader
        title="Liquidaciones"
        subtitle="Consulta las liquidaciones oficiales por predio y genera su PDF."
      />

      <SettlementSearchBar
        field={field}
        query={query}
        isSearching={listState === "loading"}
        onFieldChange={handleFieldChange}
        onQueryChange={setQuery}
        onSubmit={handleSearch}
      />

      {searchError && <Notice>{searchError}</Notice>}
      {statusChangeError && <Notice>{statusChangeError}</Notice>}

      <p className="settlements-page__count" aria-live="polite">
        {countText}
      </p>

      <div className="settlements-page__scroll">
        <SettlementList
          state={listState}
          results={results}
          selectedId={selectedId}
          editingId={editing?.where === "row" ? editing.id : null}
          editLocked={editing !== null}
          statusChangeId={statusChangeId}
          detailId={DETAIL_ID}
          onToggle={handleToggle}
          onEdit={(id) => setEditing({ id, where: "row" })}
          onSave={handleStatusChange}
          onCancel={() => setEditing(null)}
        />
      </div>

      <SettlementDetailSheet
        id={DETAIL_ID}
        open={selectedId !== null}
        entry={sheetEntry}
        editing={editing?.where === "sheet"}
        editLocked={editing !== null}
        saving={statusChangeId === sheetEntryId}
        onEdit={() =>
          sheetEntryId !== null &&
          setEditing({ id: sheetEntryId, where: "sheet" })
        }
        onSave={(status) =>
          sheetEntry && handleStatusChange(sheetEntry, status)
        }
        onCancel={() => setEditing(null)}
        onClose={closeSheet}
        onGenerate={() => {
          setPdfError(null);
          setIsPdfDialogOpen(true);
        }}
      />

      <GeneratePdfDialog
        open={isPdfDialogOpen}
        liquidacion={
          sheetEntry
            ? {
                cedulaCatastral: sheetEntry.cadastralCode,
                propietario: sheetEntry.ownerName,
              }
            : null
        }
        isGenerating={isGeneratingPdf}
        error={pdfError}
        onCancel={() => setIsPdfDialogOpen(false)}
        onGenerate={handleGeneratePdf}
      />

      <Toast message={toast} />
    </div>
  );
}
