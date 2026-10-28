import { useCallback, useEffect, useState } from "react";
import { readStoredDraft, storeDraft } from "../../api/templateDraftStorage";
import type { StoredDraft } from "../../api/templateDraftStorage";
import type { TemplateDocumentType } from "../../api/templates";
import { Icon } from "../../components/ui/Icon";
import { Screen } from "../../components/ui/Screen";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Toast } from "../../components/ui/Toast";
import { adminHref, settingsView, templatesView } from "../../routes";
import type { TemplatesSegment } from "../../routes";
import { DocumentTemplates } from "./DocumentTemplates";
import type { Outcome } from "./DocumentTemplates";
import { DOCUMENT_TEXT, SEGMENT_TYPE, TYPE_SEGMENT } from "./documentText";
import { GuidedMarking } from "./GuidedMarking";
import type { MarkingExit } from "./GuidedMarking";

const DOCUMENT_OPTIONS: { value: TemplateDocumentType; label: string }[] = [
  { value: "LIQUIDACION", label: "Liquidación" },
  { value: "MANDAMIENTO", label: "Mandamiento" },
];

const TOAST_MS = 5000;

// The templates of the municipality, one document at a time, each with its
// own address: upload a new version and see or activate the earlier ones.
// Configuración only says which version is in use.
//
// A template being marked takes the whole screen until it is saved or
// discarded, and comes back after a reload while its draft lasts.
export function TemplatesPage({
  slug,
  segment,
}: {
  slug: string;
  segment: TemplatesSegment;
}) {
  const documentType = SEGMENT_TYPE[segment];
  const [draft, setDraft] = useState<StoredDraft | null>(() =>
    readStoredDraft(),
  );
  // Belongs to the screen, not to one document: switching keeps it.
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState<Outcome | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleExit = useCallback(
    (exit: MarkingExit) => {
      // Back to the document the draft was of.
      if (draft && draft.documentType !== documentType) {
        window.location.hash = adminHref(
          slug,
          templatesView(TYPE_SEGMENT[draft.documentType]),
        );
      }
      setDraft(null);
      if (exit.kind === "saved") {
        const name = DOCUMENT_TEXT[exit.version.documentType].name;
        const message = `Se guardó la versión ${exit.version.version} y ya es la plantilla de ${name} en uso.`;
        // After the list's screen is on, so its live region announces it.
        setTimeout(() => setToast(message));
      } else if (exit.kind === "gone") {
        setNotice({ variant: "info", text: exit.message });
      }
    },
    [draft, documentType, slug],
  );

  if (draft) {
    return (
      <GuidedMarking key={draft.draftId} draft={draft} onExit={handleExit} />
    );
  }

  return (
    <Screen
      className="templates-page"
      title="Plantillas"
      subtitle="Historial de versiones del municipio y subida de una plantilla nueva."
      action={
        <a
          className="templates-page__back"
          href={adminHref(slug, settingsView("plantillas"))}
        >
          <Icon>
            <path d="M10 4l-4 4 4 4" />
          </Icon>
          Volver a Configuración
        </a>
      }
      input={
        <div className="templates-page__controls">
          <SegmentedControl
            label="Tipo de documento"
            name="template-document-type"
            options={DOCUMENT_OPTIONS}
            value={documentType}
            onChange={(next) => {
              setNotice(null);
              window.location.hash = adminHref(
                slug,
                templatesView(TYPE_SEGMENT[next]),
              );
            }}
          />
        </div>
      }
      overlay={<Toast message={toast} />}
    >
      {/* The chosen file stays when the document changes, to be uploaded
          as the new one; only the history starts afresh. */}
      <DocumentTemplates
        documentType={documentType}
        file={file}
        onFileChange={setFile}
        notice={notice}
        onDraftCreated={(created) => {
          const stored = { ...created, selections: [] };
          storeDraft(stored);
          setNotice(null);
          setDraft(stored);
        }}
      />
    </Screen>
  );
}
