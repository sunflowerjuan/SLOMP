import { useEffect, useState } from "react";
import { getErrorMessage } from "../../api/ApiError";
import {
  downloadTemplateVersion,
  previewTemplateVersion,
} from "../../api/templates";
import type { TemplateVersion } from "../../api/templates";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Notice } from "../../components/ui/Notice";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { triggerBrowserDownload } from "../../utils/downloadBlob";
import { DATE_TIME_FORMATTER } from "./documentText";
import { TemplatePreview } from "./TemplatePreview";
import type { PreviewState } from "./TemplatePreview";

interface TemplateVersionViewerProps {
  // The version to show; null keeps it closed.
  version: TemplateVersion | null;
  // "liquidación" or "mandamiento".
  documentName: string;
  onClose: () => void;
  // Only offered for a version that is not in use.
  onActivate: (version: TemplateVersion) => void;
}

// A saved version as it prints, filled with the sample data, to tell the
// versions apart before activating one. Its .docx can be downloaded too.
export function TemplateVersionViewer({
  version,
  documentName,
  onClose,
  onActivate,
}: TemplateVersionViewerProps) {
  return (
    <Dialog
      open={version !== null}
      size="wide"
      title={
        version
          ? `Versión ${version.version} de la plantilla de ${documentName}`
          : ""
      }
      onClose={onClose}
    >
      {version && (
        <VersionPreview
          key={version.id}
          version={version}
          documentName={documentName}
          onClose={onClose}
          onActivate={onActivate}
        />
      )}
    </Dialog>
  );
}

function VersionPreview({
  version,
  documentName,
  onClose,
  onActivate,
}: TemplateVersionViewerProps & { version: TemplateVersion }) {
  const [preview, setPreview] = useState<PreviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let url: string | null = null;
    previewTemplateVersion(version.id, controller.signal)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setPreview({ status: "ready", url });
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setPreview({
          status: "error",
          message: getErrorMessage(caught, { document: version.documentType }),
        });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [version.id, version.documentType, attempt]);

  async function download() {
    setDownloading(true);
    setDownloadError("");
    try {
      const { blob, fileName } = await downloadTemplateVersion(version.id);
      triggerBrowserDownload(blob, fileName ?? version.fileName);
    } catch (caught) {
      setDownloadError(getErrorMessage(caught));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="template-viewer">
      <div className="template-viewer__meta">
        {version.isActive ? (
          <StatusBadge variant="success">Activa</StatusBadge>
        ) : (
          <StatusBadge variant="neutral">Versión anterior</StatusBadge>
        )}
        <span className="templates-page__file">{version.fileName}</span>
        <span>
          Subida el {DATE_TIME_FORMATTER.format(new Date(version.createdAt))}
        </span>
      </div>

      <TemplatePreview
        state={preview}
        documentName={documentName}
        onRetry={() => {
          setPreview({ status: "loading" });
          setAttempt((current) => current + 1);
        }}
      />

      {downloadError && <Notice>{downloadError}</Notice>}

      <div className="template-viewer__actions">
        <Button
          variant="secondary"
          loading={downloading}
          onClick={() => void download()}
        >
          Descargar .docx
        </Button>
        <span className="template-viewer__spacer" />
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
        {!version.isActive && (
          <Button onClick={() => onActivate(version)}>
            Activar esta versión
          </Button>
        )}
      </div>
    </div>
  );
}
