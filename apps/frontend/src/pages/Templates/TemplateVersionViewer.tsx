import { useState } from "react";
import type { TemplateVersion } from "../../api/templates";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Notice } from "../../components/ui/Notice";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { savedText } from "./documentText";
import { useTemplateDownload } from "./useTemplateDownload";
import { VersionContent } from "./VersionContent";
import { VersionPreview } from "./VersionPreview";

type ViewerTab = "content" | "preview";

const TAB_OPTIONS: { value: ViewerTab; label: string }[] = [
  { value: "content", label: "Contenido" },
  { value: "preview", label: "Vista previa" },
];

interface TemplateVersionViewerProps {
  // The version to show; null keeps it closed.
  version: TemplateVersion | null;
  // "liquidación" or "mandamiento".
  documentName: string;
  onClose: () => void;
  // Left out where a version can't be activated. Never offered for the one
  // in use.
  onActivate?: (version: TemplateVersion) => void;
}

// A saved version, without going through marking: what it says, with each
// marker by its name, and how it prints with the sample data. Its .docx can be
// downloaded too.
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
        <VersionTabs
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

function VersionTabs({
  version,
  documentName,
  onClose,
  onActivate,
}: TemplateVersionViewerProps & { version: TemplateVersion }) {
  const [tab, setTab] = useState<ViewerTab>("content");
  // The PDF takes the service seconds: it is rendered the first time it is
  // asked for, and stays for going back and forth between the tabs.
  const [previewAsked, setPreviewAsked] = useState(false);
  const { downloadingId, downloadError, download } = useTemplateDownload();

  return (
    <div className="template-viewer">
      <div className="template-viewer__meta">
        {version.isActive ? (
          <StatusBadge variant="success">Activa</StatusBadge>
        ) : (
          <StatusBadge variant="neutral">Versión anterior</StatusBadge>
        )}
        <span className="templates-page__file">{version.fileName}</span>
        <span>{savedText(version)}</span>
      </div>

      <div className="template-viewer__tabs">
        <SegmentedControl
          label="Qué ver de esta versión"
          name="template-viewer-tab"
          options={TAB_OPTIONS}
          value={tab}
          onChange={(next) => {
            setTab(next);
            if (next === "preview") setPreviewAsked(true);
          }}
        />
      </div>

      <div className="template-viewer__panel" hidden={tab !== "content"}>
        <VersionContent version={version} />
      </div>
      {previewAsked && (
        <div className="template-viewer__panel" hidden={tab !== "preview"}>
          <VersionPreview version={version} documentName={documentName} />
        </div>
      )}

      {downloadError && <Notice>{downloadError}</Notice>}

      <div className="template-viewer__actions">
        <Button
          variant="secondary"
          loading={downloadingId === version.id}
          onClick={() => void download(version)}
        >
          Descargar .docx
        </Button>
        <span className="template-viewer__spacer" />
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
        {onActivate && !version.isActive && (
          <Button onClick={() => onActivate(version)}>
            Activar esta versión
          </Button>
        )}
      </div>
    </div>
  );
}
