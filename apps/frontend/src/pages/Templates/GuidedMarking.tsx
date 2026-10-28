import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, getErrorMessage } from "../../api/ApiError";
import {
  cancelTemplateDraft,
  getDraftContent,
  getMarkerCatalog,
  listTemplates,
  previewTemplateDraft,
  saveTemplateDraft,
} from "../../api/templates";
import type {
  DraftContent,
  MarkerCatalogEntry,
  MarkerSelection,
  TemplateVersion,
} from "../../api/templates";
import { forgetStoredDraft, storeDraft } from "../../api/templateDraftStorage";
import type { StoredDraft } from "../../api/templateDraftStorage";
import { MARKING_PROBLEM_MESSAGES } from "../../api/errorMessages";
import { Button } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/CloseIcon";
import { Notice } from "../../components/ui/Notice";
import { Screen } from "../../components/ui/Screen";
import { Steps } from "../../components/ui/Steps";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useSwipeToDismiss } from "../../hooks/useSwipeToDismiss";
import {
  entryProblem,
  isTableField,
  isTableLoop,
  mergeAdjacent,
  progressText,
  rangeProblem,
  requiredProgress,
  sameRange,
  sortSelections,
  tableRowInUse,
  trimRange,
  usedFields,
} from "../../domain/templateMarking";
import type { MarkingProblem, TextRange } from "../../domain/templateMarking";
import { DATE_TIME_FORMATTER, DOCUMENT_TEXT } from "./documentText";
import {
  DiscardDraftDialog,
  ReplaceTemplateDialog,
} from "./GuidedMarkingDialogs";
import { MarkerChecklist } from "./MarkerChecklist";
import { MarkerMenu } from "./MarkerMenu";
import type { MenuGroup } from "./MarkerMenu";
import { clearSelection } from "./documentSelection";
import { MarkingDocument } from "./MarkingDocument";
import type { DocumentMark } from "./MarkingDocument";
import { TemplatePreview } from "./TemplatePreview";
import type { PreviewState } from "./TemplatePreview";
import "./GuidedMarking.css";

export type MarkingExit =
  | { kind: "saved"; version: TemplateVersion }
  | { kind: "discarded" }
  // The draft expired or no longer exists: the lawyer uploads it again.
  | { kind: "gone"; message: string };

type Step = "mark" | "review";

const STEPS = ["Subir", "Marcar", "Revisar y guardar"];

const FLASH_MS = 1600;

function isDraftGone(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "TEMPLATE_DRAFT_NOT_FOUND" ||
      error.code === "TEMPLATE_DRAFT_EXPIRED")
  );
}

// TEMPLATE_FIELDS_INVALID lists the missing markers by key: the message names
// them by their Spanish name instead.
function withFieldLabels(
  error: unknown,
  labels: ReadonlyMap<string, string>,
): unknown {
  if (
    !(error instanceof ApiError) ||
    error.code !== "TEMPLATE_FIELDS_INVALID"
  ) {
    return error;
  }
  const missing = Array.isArray(error.details.missing)
    ? (error.details.missing as unknown[])
    : [];
  return new ApiError(error.status, error.message, error.code, {
    ...error.details,
    missingLabels: missing
      .map((key) => (typeof key === "string" ? labels.get(key) : undefined))
      .filter(Boolean),
  });
}

function missingText(missing: MarkerCatalogEntry[]): string {
  const names = missing.map((entry) => `«${entry.label}»`);
  const list =
    names.length > 1
      ? `${names.slice(0, -1).join(", ")} y ${names.at(-1)}`
      : names[0];
  return `Para guardar falta asignar ${list}.`;
}

interface Pending {
  range: TextRange;
  origin: HTMLElement;
}

interface GuidedMarkingProps {
  draft: StoredDraft;
  onExit: (exit: MarkingExit) => void;
}

// Guided marking (Confluence "Contrato del marcado guiado de plantillas"): the
// uploaded .docx is shown as text; the lawyer selects what changes in each
// document and says which field it is, previews the result with sample data
// and saves it as the active version. The draft and the selections survive a
// reload (templateDraftStorage) until the draft expires.
export function GuidedMarking({ draft, onExit }: GuidedMarkingProps) {
  const text = DOCUMENT_TEXT[draft.documentType];
  const phone = useMediaQuery("(max-width: 900px)");

  const [content, setContent] = useState<DraftContent | null>(null);
  const [catalog, setCatalog] = useState<MarkerCatalogEntry[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selections, setSelections] = useState(draft.selections);
  const [step, setStep] = useState<Step>("mark");
  const [pending, setPending] = useState<Pending | null>(null);
  const [problem, setProblem] = useState<MarkingProblem | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ status: "loading" });
  const [versions, setVersions] = useState<TemplateVersion[] | null>(null);
  const [replacing, setReplacing] = useState<TemplateVersion | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const documentRef = useRef<HTMLDivElement>(null);
  const stepRef = useRef<HTMLDivElement>(null);
  const sheetTriggerRef = useRef<HTMLButtonElement>(null);
  const previewUrl = useRef<string | null>(null);
  const previewKey = useRef("");
  const previewController = useRef<AbortController | null>(null);

  const leave = useCallback(
    (exit: MarkingExit) => {
      forgetStoredDraft(draft.draftId);
      onExit(exit);
    },
    [draft.draftId, onExit],
  );

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getDraftContent(draft.draftId, controller.signal),
      getMarkerCatalog(draft.documentType, controller.signal),
    ])
      .then(([loadedContent, loadedCatalog]) => {
        setContent(loadedContent);
        setCatalog(loadedCatalog);
        setLoadError("");
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if (isDraftGone(caught)) {
          leave({ kind: "gone", message: getErrorMessage(caught) });
        } else {
          setLoadError(getErrorMessage(caught));
        }
      });
    // The active version, to warn before replacing it; read again on save if
    // this fails.
    listTemplates(draft.documentType, controller.signal)
      .then(setVersions)
      .catch(() => undefined);
    return () => controller.abort();
  }, [draft.draftId, draft.documentType, leave, loadAttempt]);

  useEffect(() => {
    storeDraft({ ...draft, selections });
  }, [draft, selections]);

  // The preview's object URL lives until the next preview or the screen goes.
  useEffect(
    () => () => {
      previewController.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );

  const labels = useMemo(
    () => new Map(catalog?.map((entry) => [entry.key, entry.label]) ?? []),
    [catalog],
  );
  const blocks = useMemo(() => content?.blocks ?? [], [content]);
  const applied = useMemo(
    () => mergeAdjacent(content?.appliedMarkers ?? []),
    [content],
  );
  const allMarks = useMemo(
    () => [...applied, ...selections],
    [applied, selections],
  );
  const used = useMemo(
    () => usedFields(selections, applied),
    [selections, applied],
  );
  const progress = useMemo(
    () => requiredProgress(catalog ?? [], used),
    [catalog, used],
  );
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const { field } of allMarks) {
      result.set(field, (result.get(field) ?? 0) + 1);
      const dot = field.indexOf(".");
      if (dot >= 0) {
        const loop = field.slice(0, dot);
        result.set(loop, (result.get(loop) ?? 0) + 1);
      }
    }
    return result;
  }, [allMarks]);
  const repeatingRow = useMemo(
    () => tableRowInUse(blocks, catalog ?? [], allMarks),
    [blocks, catalog, allMarks],
  );
  const sorted = useMemo(
    () => sortSelections(blocks, selections),
    [blocks, selections],
  );

  const documentMarks: DocumentMark[] = useMemo(
    () => [
      ...applied.map((mark) => ({ mark, source: "file" as const })),
      ...selections.map((mark) => ({ mark, source: "lawyer" as const })),
      ...(pending
        ? [
            {
              mark: { ...pending.range, field: "" },
              source: "pending" as const,
            },
          ]
        : []),
    ],
    [applied, selections, pending],
  );

  const menuGroups: MenuGroup[] = useMemo(() => {
    if (!pending || !catalog) return [];
    const block = blocks.find(
      (candidate) => candidate.blockId === pending.range.blockId,
    );
    if (!block) return [];
    const groups: MenuGroup[] = [
      {
        id: "document",
        title: "Datos del documento",
        entries: catalog.filter(
          (entry) => !isTableLoop(entry) && !isTableField(entry),
        ),
      },
    ];
    for (const loop of catalog.filter(isTableLoop)) {
      const fields = catalog.filter((entry) =>
        entry.key.startsWith(`${loop.key}.`),
      );
      groups.push({
        id: loop.key,
        title: loop.label,
        explanation:
          "Se repite una fila por cada año: marca estos datos en la fila de ejemplo de la tabla.",
        problem: fields[0]
          ? entryProblem(fields[0], block, repeatingRow)
          : null,
        entries: fields,
      });
    }
    // Text in a table cell is most likely a table field: those come first.
    return block.table ? [...groups.slice(1), groups[0]] : groups;
  }, [pending, catalog, blocks, repeatingRow]);

  function announce(message: string) {
    setAnnouncement(message);
  }

  function showProblem(next: MarkingProblem) {
    setProblem(next);
    announce("");
  }

  function handleSelect(range: TextRange, origin: HTMLElement) {
    const block = blocks.find(
      (candidate) => candidate.blockId === range.blockId,
    );
    if (!block) return;
    clearSelection();
    const trimmed = trimRange(block.text, range.start, range.end);
    if (!trimmed) {
      showProblem("EMPTY");
      return;
    }
    const next = { blockId: range.blockId, ...trimmed };
    const overlap = rangeProblem(next, allMarks);
    if (overlap) {
      showProblem(overlap);
      return;
    }
    setProblem(null);
    setPending({ range: next, origin });
  }

  function closeMenu() {
    const origin = pending?.origin;
    setPending(null);
    origin?.focus({ preventScroll: true });
  }

  function pick(entry: MarkerCatalogEntry) {
    if (!pending) return;
    const added: MarkerSelection = { ...pending.range, field: entry.key };
    setSelections((current) => [...current, added]);
    announce(`Se asignó «${entry.label}».`);
    closeMenu();
  }

  function remove(mark: MarkerSelection) {
    setSelections((current) =>
      current.filter((selection) => !sameRange(selection, mark)),
    );
    setProblem(null);
    announce(`Se quitó «${labels.get(mark.field) ?? "el marcador"}».`);
    // The button goes with the highlight: focus stays on its paragraph.
    documentRef.current
      ?.querySelector<HTMLElement>(
        `[data-block-id="${CSS.escape(mark.blockId)}"] .marking-doc__focus`,
      )
      ?.focus({ preventScroll: true });
  }

  function locate(entry: MarkerCatalogEntry) {
    setSheetOpen(false);
    const target = documentRef.current?.querySelector<HTMLElement>(
      `[data-field="${CSS.escape(entry.key)}"], [data-field^="${CSS.escape(entry.key)}."]`,
    );
    if (!target) return;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    target.dataset.flash = "true";
    setTimeout(() => delete target.dataset.flash, FLASH_MS);
    (
      target.querySelector<HTMLElement>(".marking-doc__remove") ??
      target
        .closest("[data-block-id]")
        ?.querySelector<HTMLElement>(".marking-doc__focus")
    )?.focus({ preventScroll: true });
  }

  const runPreview = useCallback(
    async (force = false) => {
      const key = JSON.stringify(sorted);
      if (!force && key === previewKey.current) return;
      previewKey.current = key;
      previewController.current?.abort();
      const controller = new AbortController();
      previewController.current = controller;
      setPreview({ status: "loading" });
      try {
        const blob = await previewTemplateDraft(
          draft.draftId,
          sorted,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
        previewUrl.current = URL.createObjectURL(blob);
        setPreview({ status: "ready", url: previewUrl.current });
      } catch (caught) {
        if (controller.signal.aborted) return;
        // A failed preview is asked again on the next visit to the step.
        previewKey.current = "";
        if (isDraftGone(caught)) {
          leave({ kind: "gone", message: getErrorMessage(caught) });
          return;
        }
        setPreview({
          status: "error",
          message: getErrorMessage(caught, { document: draft.documentType }),
        });
      }
    },
    [sorted, draft.draftId, draft.documentType, leave],
  );

  function goTo(next: Step) {
    setStep(next);
    setPending(null);
    setSaveError("");
    if (next === "review") void runPreview();
    setTimeout(() => stepRef.current?.focus({ preventScroll: true }));
  }

  async function save(replaceConfirmed: boolean) {
    setSaving(true);
    setSaveError("");
    try {
      const version = await saveTemplateDraft(
        draft.draftId,
        sorted,
        replaceConfirmed,
      );
      leave({ kind: "saved", version });
    } catch (caught) {
      if (isDraftGone(caught)) {
        leave({ kind: "gone", message: getErrorMessage(caught) });
        return;
      }
      if (
        caught instanceof ApiError &&
        caught.code === "TEMPLATE_REPLACE_NOT_CONFIRMED"
      ) {
        // Another version became active meanwhile: ask before replacing it.
        try {
          const fresh = await listTemplates(draft.documentType);
          setVersions(fresh);
          const active = fresh.find((version) => version.isActive);
          if (active) {
            setReplacing(active);
            return;
          }
        } catch {
          // Falls through to the message below.
        }
      }
      setSaveError(getErrorMessage(withFieldLabels(caught, labels)));
    } finally {
      setSaving(false);
    }
  }

  async function requestSave() {
    if (progress.missing.length > 0) return;
    let list = versions;
    if (list === null) {
      try {
        list = await listTemplates(draft.documentType);
        setVersions(list);
      } catch (caught) {
        setSaveError(getErrorMessage(caught));
        return;
      }
    }
    const active = list.find((version) => version.isActive);
    if (active) {
      setSaveError("");
      setReplacing(active);
    } else {
      await save(false);
    }
  }

  async function discard() {
    setDiscarding(true);
    try {
      await cancelTemplateDraft(draft.draftId);
    } catch {
      // Nothing to do about it: the backend's sweep removes the draft when
      // it expires, and it is no longer offered here.
    }
    leave({ kind: "discarded" });
  }

  function requestCancel() {
    if (selections.length > 0) setDiscardOpen(true);
    else void discard();
  }

  // Phone: the list of markers is a bottom sheet over the document.
  const { ref: sheetRef, bind: sheetBind } = useSwipeToDismiss<HTMLElement>(
    () => setSheetOpen(false),
    { axis: "y", media: "(max-width: 900px)" },
  );
  useEffect(() => {
    if (sheetOpen) sheetRef.current?.focus({ preventScroll: true });
  }, [sheetOpen, sheetRef]);

  function closeSheet() {
    setSheetOpen(false);
    sheetTriggerRef.current?.focus({ preventScroll: true });
  }

  const ready = content !== null && catalog !== null;
  const canSave = ready && progress.missing.length === 0;
  const missingId = "guided-marking-missing";
  const pendingText =
    pending &&
    blocks
      .find((block) => block.blockId === pending.range.blockId)
      ?.text.slice(pending.range.start, pending.range.end);

  const checklist = ready && (
    <MarkerChecklist
      catalog={catalog}
      counts={counts}
      progress={progress}
      documentName={text.name}
      onLocate={locate}
    />
  );

  const anchor = useCallback(
    () =>
      documentRef.current
        ?.querySelector('[data-source="pending"]')
        ?.getBoundingClientRect() ?? null,
    [],
  );

  return (
    <Screen
      className="guided-marking"
      title={`Nueva plantilla de ${text.name}`}
      subtitle={`${draft.fileName} · el borrador se conserva hasta el ${DATE_TIME_FORMATTER.format(new Date(draft.expiresAt))}`}
      covered={phone && (sheetOpen || pending !== null)}
      input={
        <div className="guided-marking__controls">
          <Steps
            label={`Pasos para crear la plantilla de ${text.name}`}
            steps={STEPS}
            current={step === "mark" ? 1 : 2}
          />
          <div className="guided-marking__bar">
            {ready && step === "mark" && (
              <>
                {phone ? (
                  <button
                    ref={sheetTriggerRef}
                    type="button"
                    className="guided-marking__progress-button"
                    aria-expanded={sheetOpen}
                    aria-controls="guided-marking-sheet"
                    onClick={() => setSheetOpen(true)}
                  >
                    Marcadores · <strong>{progressText(progress)}</strong>
                  </button>
                ) : (
                  <p className="guided-marking__summary">
                    <strong>{progressText(progress)}</strong>
                  </p>
                )}
              </>
            )}
            {ready && step === "review" && (
              <p
                id={missingId}
                className="guided-marking__summary"
                data-missing={!canSave || undefined}
              >
                {canSave
                  ? "Todos los marcadores obligatorios están asignados."
                  : missingText(progress.missing)}
              </p>
            )}
            <div className="guided-marking__actions">
              <Button
                variant="secondary"
                disabled={saving || discarding}
                onClick={requestCancel}
              >
                Cancelar
              </Button>
              {step === "mark" ? (
                <Button disabled={!ready} onClick={() => goTo("review")}>
                  Vista previa
                </Button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    disabled={saving}
                    onClick={() => goTo("mark")}
                  >
                    Volver a marcar
                  </Button>
                  <Button
                    className="guided-marking__save"
                    disabled={!canSave}
                    loading={saving && replacing === null}
                    aria-describedby={canSave ? undefined : missingId}
                    onClick={() => void requestSave()}
                  >
                    Guardar plantilla
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      }
      overlay={
        <>
          <p className="marking-doc__sr" role="status">
            {announcement}
          </p>
          {pending && pendingText !== undefined && pendingText !== null && (
            <MarkerMenu
              text={pendingText}
              groups={menuGroups}
              used={used}
              anchor={anchor}
              onPick={pick}
              onClose={closeMenu}
            />
          )}
          {phone && step === "mark" && (
            <>
              <div
                className="guided-marking__scrim"
                data-open={sheetOpen}
                onClick={closeSheet}
                aria-hidden="true"
              />
              <aside
                ref={sheetRef}
                id="guided-marking-sheet"
                className="guided-marking__sheet"
                data-open={sheetOpen}
                tabIndex={-1}
                aria-label="Marcadores"
                inert={!sheetOpen}
                onKeyDown={(event) => {
                  if (event.key === "Escape") closeSheet();
                }}
              >
                <div className="guided-marking__sheet-head" {...sheetBind}>
                  <button
                    type="button"
                    className="guided-marking__sheet-close"
                    aria-label="Cerrar marcadores"
                    onClick={closeSheet}
                  >
                    <CloseIcon />
                  </button>
                </div>
                {checklist}
              </aside>
            </>
          )}
          <ReplaceTemplateDialog
            active={replacing}
            documentName={text.name}
            saving={saving}
            error={replacing ? saveError : ""}
            onCancel={() => {
              setReplacing(null);
              setSaveError("");
            }}
            onConfirm={() => void save(true)}
          />
          <DiscardDraftDialog
            open={discardOpen}
            assigned={selections.length}
            discarding={discarding}
            onKeep={() => setDiscardOpen(false)}
            onDiscard={() => void discard()}
          />
        </>
      }
    >
      <div
        ref={stepRef}
        className="guided-marking__step"
        data-step={step}
        role="region"
        aria-label={`Paso ${step === "mark" ? 2 : 3} de ${STEPS.length}: ${step === "mark" ? STEPS[1] : STEPS[2]}`}
        tabIndex={-1}
      >
        {loadError && (
          <Notice className="guided-marking__retry">
            {loadError}
            <Button
              variant="secondary"
              onClick={() => {
                setLoadError("");
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              Reintentar
            </Button>
          </Notice>
        )}

        {step === "mark" && !loadError && (
          <div className="guided-marking__workspace">
            <div className="guided-marking__document">
              {problem && (
                <div className="guided-marking__problem">
                  <Notice>{MARKING_PROBLEM_MESSAGES[problem]}</Notice>
                </div>
              )}
              {ready ? (
                <div ref={documentRef} className="guided-marking__paper">
                  <MarkingDocument
                    blocks={blocks}
                    marks={documentMarks}
                    labels={labels}
                    repeatingRow={repeatingRow}
                    onSelect={handleSelect}
                    onProblem={showProblem}
                    onRemove={remove}
                  />
                </div>
              ) : (
                <div
                  className="guided-marking__paper guided-marking__paper--loading"
                  role="status"
                  aria-label="Cargando el documento"
                >
                  {[90, 75, 82, 40, 88, 66].map((width, index) => (
                    <i key={index} style={{ width: `${width}%` }} />
                  ))}
                </div>
              )}
            </div>
            {!phone && (
              <aside className="guided-marking__aside">{checklist}</aside>
            )}
          </div>
        )}

        {step === "review" && (
          <>
            {saveError && !replacing && <Notice>{saveError}</Notice>}
            <TemplatePreview
              state={preview}
              documentName={text.name}
              onRetry={() => void runPreview(true)}
            />
          </>
        )}
      </div>
    </Screen>
  );
}
