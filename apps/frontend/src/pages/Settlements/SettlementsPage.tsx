import { useEffect, useRef, useState } from "react";
import { getErrorMessage, isRetryable } from "../../api/ApiError";
import { messageForErrorCode } from "../../api/errorMessages";
import {
  changeSettlementStatus,
  generateLiquidationPdf,
  searchSettlements,
} from "../../api/settlements";
import type {
  SettlementPeriodStatus,
  SettlementSearchCriteria,
  SettlementSearchResult,
} from "../../api/settlements";
import { withPeriodChanged } from "../../domain/settlementPeriods";
import { SETTLEMENT_STATUS_LABEL } from "../../domain/settlementStatus";
import type { SettlementStatus } from "../../domain/settlementStatus";
import { GeneratePdfDialog } from "../../components/ui/GeneratePdfDialog";
import { Notice } from "../../components/ui/Notice";
import { RetryNotice } from "../../components/ui/RetryNotice";
import { Screen } from "../../components/ui/Screen";
import { Toast } from "../../components/ui/Toast";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSlompsim } from "../../slompsim/useSlompsim";
import { MEDIA } from "../../styles/breakpoints";
import { triggerBrowserDownload } from "../../utils/downloadBlob";
import { formatCount } from "../../utils/formatCount";
import { SettlementDetailSheet } from "./SettlementDetailSheet";
import { SettlementList } from "./SettlementList";
import type { ListState } from "./SettlementList";
import { SettlementSearchBar } from "./SettlementSearchBar";
import type { SearchField } from "./SettlementSearchBar";
import "./SettlementsPage.css";

const DETAIL_ID = "settlement-detail";

interface FailedStatusChange {
  settlement: SettlementPeriodStatus;
  status: SettlementStatus;
  message: string;
  retryable: boolean;
}

export function SettlementsPage() {
  const [field, setField] = useState<SearchField>("cadastralCode");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SettlementSearchResult[]>([]);
  const [listState, setListState] = useState<ListState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  // The sheet keeps showing the last selection while it slides out.
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetEntryId, setSheetEntryId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [statusChangeId, setStatusChangeId] = useState<number | null>(null);
  const [failedStatusChange, setFailedStatusChange] =
    useState<FailedStatusChange | null>(null);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const {
    isOpen: slompsimOpen,
    close: closeSlompsim,
    conversation: { appliedIds },
  } = useSlompsim();
  const [slompsimWasOpen, setSlompsimWasOpen] = useState(slompsimOpen);
  const searched = useRef<SettlementSearchCriteria | null>(null);
  const appliedCount = appliedIds.length;

  // Never two panels on the right: opening Slompsim closes the sheet, and
  // opening the sheet closes Slompsim (handleToggle).
  if (slompsimOpen !== slompsimWasOpen) {
    setSlompsimWasOpen(slompsimOpen);
    if (slompsimOpen) {
      setSelectedId(null);
      setEditingId(null);
    }
  }

  // Slompsim floats over this list: what it applied shows up right away.
  useEffect(() => {
    if (appliedCount === 0 || !searched.current) return;
    let cancelled = false;
    searchSettlements(searched.current)
      .then((found) => {
        if (!cancelled) setResults(found);
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setSearchError(getErrorMessage(caught));
        setListState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [appliedCount]);

  // Below 1440px the open sheet covers the list behind a scrim: keep it out of
  // the tab order and the accessibility tree meanwhile.
  const wide = useMediaQuery(MEDIA.wide);
  const covered = selectedId !== null && !wide;

  const sheetEntry =
    results.find((entry) => entry.settlementId === sheetEntryId) ?? null;

  function closeSheet() {
    const id = selectedId;
    setSelectedId(null);
    setEditingId(null);
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
    setSearchError(null);
    setFailedStatusChange(null);
    setSelectedId(null);
    setSheetEntryId(null);
    setEditingId(null);

    const text = query.trim();
    if (!text) {
      setSearchError(
        messageForErrorCode("SETTLEMENT_SEARCH_CRITERIA_REQUIRED"),
      );
      setListState("invalid");
      return;
    }

    setListState("loading");
    const criteria = { [field]: text };
    try {
      const found = await searchSettlements(criteria);
      setResults(found);
      searched.current = criteria;
      setListState(found.length ? "results" : "empty");
    } catch (caught) {
      setSearchError(getErrorMessage(caught));
      setListState("error");
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
    closeSlompsim({ returnFocus: false });
    setSelectedId(id);
    setSheetEntryId(id);
    setEditingId(null);
    setFailedStatusChange(null);
    setPdfError(null);
  }

  async function handleStatusChange(
    settlement: SettlementPeriodStatus,
    status: SettlementStatus,
  ) {
    if (status === settlement.status) {
      setEditingId(null);
      setToast("El estado no cambió.");
      return;
    }

    setStatusChangeId(settlement.settlementId);
    setFailedStatusChange(null);
    try {
      const change = await changeSettlementStatus(
        settlement.settlementId,
        status,
      );
      setResults((current) =>
        current.map((row) =>
          row.settlementId === sheetEntryId
            ? withPeriodChanged(row, change)
            : row,
        ),
      );
      setEditingId(null);
      setToast(
        `Estado del periodo ${settlement.period} actualizado a «${SETTLEMENT_STATUS_LABEL[status]}».`,
      );
    } catch (caught) {
      setFailedStatusChange({
        settlement,
        status,
        message: getErrorMessage(caught),
        retryable: isRetryable(caught),
      });
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
      if (!sheetEntry.resolutionNumber) refreshResults();
    } catch (caught) {
      setPdfError(getErrorMessage(caught));
    } finally {
      setIsGeneratingPdf(false);
    }
  }

  // A first PDF gave the liquidation its resolution: the sheet and the next
  // "Generar PDF" need to know. If this fails the rows just stay as they were;
  // the PDF is already downloading.
  function refreshResults() {
    if (!searched.current) return;
    searchSettlements(searched.current)
      .then(setResults)
      .catch(() => undefined);
  }

  function handleGenerateFromSheet() {
    setPdfError(null);
    if (sheetEntry?.resolutionNumber) {
      void handleGeneratePdf();
    } else {
      setIsPdfDialogOpen(true);
    }
  }

  function sheetLayout() {
    if (selectedId === null) return "closed";
    return wide ? "pushed" : "open";
  }

  function statusNotice() {
    if (!failedStatusChange) return null;
    const { settlement, status, message, retryable } = failedStatusChange;
    return retryable ? (
      <RetryNotice onRetry={() => void handleStatusChange(settlement, status)}>
        {message}
      </RetryNotice>
    ) : (
      <Notice>{message}</Notice>
    );
  }

  const countText =
    listState === "results" || listState === "empty"
      ? formatCount(results.length, "liquidación", "liquidaciones")
      : "";

  return (
    <Screen
      className="settlements-page"
      data-sheet={sheetLayout()}
      title="Liquidaciones"
      covered={covered}
      input={
        <>
          <SettlementSearchBar
            field={field}
            query={query}
            isSearching={listState === "loading"}
            onFieldChange={handleFieldChange}
            onQueryChange={setQuery}
            onSubmit={handleSearch}
          />

          <p className="settlements-page__count" aria-live="polite">
            {countText}
          </p>
        </>
      }
      overlay={
        <>
          <SettlementDetailSheet
            id={DETAIL_ID}
            open={selectedId !== null}
            entry={sheetEntry}
            editingId={editingId}
            savingId={statusChangeId}
            statusNotice={statusNotice()}
            generating={isGeneratingPdf && !isPdfDialogOpen}
            error={isPdfDialogOpen ? null : pdfError}
            onEdit={setEditingId}
            onSave={handleStatusChange}
            onCancel={() => setEditingId(null)}
            onClose={closeSheet}
            onGenerate={handleGenerateFromSheet}
          />

          <GeneratePdfDialog
            open={isPdfDialogOpen}
            isGenerating={isGeneratingPdf}
            error={pdfError}
            onCancel={() => setIsPdfDialogOpen(false)}
            onGenerate={handleGeneratePdf}
          />

          <Toast message={toast} onExpire={() => setToast(null)} />
        </>
      }
    >
      <SettlementList
        state={listState}
        message={searchError}
        onRetry={() => void handleSearch()}
        results={results}
        selectedId={selectedId}
        detailId={DETAIL_ID}
        onToggle={handleToggle}
      />
    </Screen>
  );
}
