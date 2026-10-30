import { useCallback, useEffect, useState } from "react";
import { getErrorMessage } from "../../api/ApiError";
import {
  activateTemplate,
  createTemplateDraft,
  listTemplates,
} from "../../api/templates";
import type {
  TemplateDocumentType,
  TemplateDraft,
  TemplateVersion,
} from "../../api/templates";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Dialog } from "../../components/ui/Dialog";
import { Dropzone } from "../../components/ui/Dropzone";
import { Icon } from "../../components/ui/Icon";
import { Notice } from "../../components/ui/Notice";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { DOCUMENT_TEXT, savedText } from "./documentText";
import { TemplateVersionViewer } from "./TemplateVersionViewer";
import { useTemplateDownload } from "./useTemplateDownload";
import "./TemplatesPage.css";

// Same limit the backend enforces (TEMPLATE_UPLOAD_LIMITS).
const MAX_TEMPLATE_SIZE_MB = 5;

export type Outcome = { variant: "success" | "info" | "error"; text: string };

interface DocumentTemplatesProps {
  documentType: TemplateDocumentType;
  // The file chosen for a new version. It belongs to the page, so switching
  // the document type keeps it instead of dropping it.
  file: File | null;
  onFileChange: (file: File | null) => void;
  // The uploaded file is a draft: the page moves on to marking it.
  onDraftCreated: (draft: TemplateDraft) => void;
  // Why the page came back here, e.g. the draft being marked expired.
  notice?: Outcome | null;
}

// The templates of one document in the municipality: the upload of a new
// version, which always goes through marking, preview and, when it replaces
// the active one, a confirmation; and the history. The upload card stays put
// when the document changes (the file chosen stays in the same field); the
// history starts afresh.
export function DocumentTemplates({
  documentType,
  file,
  onFileChange,
  onDraftCreated,
  notice = null,
}: DocumentTemplatesProps) {
  const [uploading, setUploading] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(notice);
  // A message about the other document's upload goes with it.
  const [outcomeType, setOutcomeType] = useState(documentType);
  if (outcomeType !== documentType) {
    setOutcomeType(documentType);
    setOutcome(null);
  }

  async function handleContinue() {
    if (!file) return;
    setOutcome(null);
    setUploading(true);
    try {
      const draft = await createTemplateDraft(documentType, file);
      onFileChange(null);
      onDraftCreated(draft);
    } catch (caught) {
      setOutcome({
        variant: "error",
        text: getErrorMessage(caught, { document: documentType }),
      });
      setUploading(false);
    }
  }

  return (
    <div className="templates-page__layout">
      <Card
        title="Subir una plantilla nueva"
        subtitle="Sube el documento de Word, con o sin marcadores. Luego marcas en el texto dónde va cada dato y ves una vista previa antes de guardarla."
        className="templates-page__upload"
      >
        <Dropzone
          file={file}
          accept=".docx"
          maxSizeMb={MAX_TEMPLATE_SIZE_MB}
          onFileSelect={(selected) => {
            onFileChange(selected);
            setOutcome(null);
          }}
          onClear={() => {
            onFileChange(null);
            setOutcome(null);
          }}
        />

        {outcome && <Notice variant={outcome.variant}>{outcome.text}</Notice>}

        <div className="templates-page__actions">
          <Button
            type="button"
            disabled={!file}
            loading={uploading}
            onClick={() => void handleContinue()}
          >
            Continuar
          </Button>
        </div>
      </Card>

      <TemplateHistory key={documentType} documentType={documentType} />
    </div>
  );
}

// Every version of one document, newest first: each can be read, seen as it
// prints and downloaded, and an earlier one activated again, which asks first.
function TemplateHistory({
  documentType,
}: {
  documentType: TemplateDocumentType;
}) {
  const text = DOCUMENT_TEXT[documentType];
  const [versions, setVersions] = useState<TemplateVersion[] | null>(null);
  const [listError, setListError] = useState("");
  const [activated, setActivated] = useState("");
  const [viewing, setViewing] = useState<TemplateVersion | null>(null);
  const [toActivate, setToActivate] = useState<TemplateVersion | null>(null);
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState("");
  const { downloadingId, downloadError, download } = useTemplateDownload();

  const reload = useCallback(async () => {
    try {
      setVersions(await listTemplates(documentType));
      setListError("");
    } catch (caught) {
      setListError(getErrorMessage(caught));
    }
  }, [documentType]);

  useEffect(() => {
    const controller = new AbortController();
    listTemplates(documentType, controller.signal)
      .then(setVersions)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setListError(getErrorMessage(caught));
      });
    return () => controller.abort();
  }, [documentType]);

  function askToActivate(version: TemplateVersion) {
    setViewing(null);
    setActivateError("");
    setToActivate(version);
  }

  async function handleActivate() {
    if (!toActivate) return;
    setActivateError("");
    setActivating(true);
    try {
      const version = await activateTemplate(toActivate.id);
      setActivated(`La versión ${version.version} quedó activa.`);
      setToActivate(null);
      void reload();
    } catch (caught) {
      setActivateError(getErrorMessage(caught));
    } finally {
      setActivating(false);
    }
  }

  const active = versions?.find((version) => version.isActive) ?? null;

  return (
    <>
      <Card
        title="Historial de versiones"
        subtitle={
          versions === null || versions.length === 0
            ? undefined
            : active
              ? `En uso: versión ${active.version}. Puedes volver a activar cualquier versión anterior.`
              : `Ninguna versión está en uso: sin plantilla activa no se generan los PDF de ${text.name}.`
        }
        className="templates-page__versions"
      >
        {activated && <Notice variant="success">{activated}</Notice>}
        {downloadError && <Notice>{downloadError}</Notice>}

        {listError && (
          <Notice className="templates-page__retry">
            {listError}
            <Button variant="secondary" onClick={() => void reload()}>
              Reintentar
            </Button>
          </Notice>
        )}

        {versions === null && !listError && (
          <ul
            className="templates-page__list"
            role="status"
            aria-label="Cargando versiones"
          >
            {[0, 1].map((row) => (
              <li
                key={row}
                className="templates-page__version templates-page__version--skeleton"
                aria-hidden="true"
              >
                <div>
                  <i />
                  <i />
                </div>
              </li>
            ))}
          </ul>
        )}

        {versions?.length === 0 && (
          <p className="templates-page__muted">
            Todavía no se ha subido ninguna plantilla de {text.name} en este
            municipio.
          </p>
        )}

        {versions && versions.length > 0 && (
          <ul className="templates-page__list">
            {versions.map((version) => (
              <li key={version.id} className="templates-page__version">
                <div>
                  <strong>Versión {version.version}</strong>
                  <span className="templates-page__file">
                    {version.fileName}
                  </span>
                  <span>{savedText(version)}</span>
                </div>
                <div className="templates-page__version-actions">
                  <Button
                    variant="secondary"
                    className="templates-page__view"
                    aria-label={`Ver la versión ${version.version}`}
                    title="Ver esta versión"
                    onClick={() => setViewing(version)}
                  >
                    <Icon>
                      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
                      <circle cx="8" cy="8" r="2" />
                    </Icon>
                  </Button>
                  <Button
                    variant="secondary"
                    className="templates-page__view"
                    aria-label={`Descargar la versión ${version.version}`}
                    title="Descargar el documento de Word"
                    loading={downloadingId === version.id}
                    onClick={() => void download(version)}
                  >
                    <Icon>
                      <path d="M8 2.5v8M4.5 7.5 8 11l3.5-3.5M2.5 13.5h11" />
                    </Icon>
                  </Button>
                  {version.isActive ? (
                    <StatusBadge variant="success">Activa</StatusBadge>
                  ) : (
                    <Button
                      variant="secondary"
                      aria-label={`Activar la versión ${version.version}`}
                      onClick={() => askToActivate(version)}
                    >
                      Activar
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <TemplateVersionViewer
        version={viewing}
        documentName={text.name}
        onClose={() => setViewing(null)}
        onActivate={askToActivate}
      />

      <Dialog
        open={toActivate !== null}
        title={`¿Activar la versión ${toActivate?.version ?? ""}?`}
        onClose={() => {
          if (!activating) setToActivate(null);
        }}
      >
        <div className="ui-dialog__body">
          <p>
            Los próximos PDF de {text.name} usarán la versión{" "}
            {toActivate?.version}.
            {active &&
              ` La versión ${active.version}, que está en uso, se conserva y puedes volver a activarla.`}
          </p>
        </div>
        {activateError && (
          <Notice className="ui-dialog__notice">{activateError}</Notice>
        )}
        <div className="ui-dialog__actions">
          <Button
            variant="secondary"
            disabled={activating}
            onClick={() => setToActivate(null)}
          >
            Cancelar
          </Button>
          <Button loading={activating} onClick={handleActivate}>
            Activar
          </Button>
        </div>
      </Dialog>
    </>
  );
}
