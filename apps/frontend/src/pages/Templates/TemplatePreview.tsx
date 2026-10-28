import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { useMediaQuery } from "../../hooks/useMediaQuery";

export type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; url: string };

interface TemplatePreviewProps {
  state: PreviewState;
  // "liquidación" or "mandamiento".
  documentName: string;
  onRetry: () => void;
}

// The marked template as a PDF, filled with the backend's fictitious sample
// data. A phone's browser can't show a PDF inside the page, so there it
// opens on its own.
export function TemplatePreview({
  state,
  documentName,
  onRetry,
}: TemplatePreviewProps) {
  const phone = useMediaQuery("(max-width: 900px)");

  return (
    <div className="template-preview">
      <Notice variant="info">
        Vista previa con datos de ejemplo ficticios. Cada {documentName} real
        saldrá con los datos de su predio y contribuyente.
      </Notice>

      {state.status === "loading" && (
        <div className="template-preview__frame template-preview__frame--loading">
          <span className="template-preview__spinner" aria-hidden="true" />
          <p role="status">Generando la vista previa…</p>
        </div>
      )}

      {state.status === "error" && (
        <Notice className="template-preview__error">
          {state.message}
          <Button variant="secondary" onClick={onRetry}>
            Reintentar
          </Button>
        </Notice>
      )}

      {state.status === "ready" &&
        (phone ? (
          <div className="template-preview__frame template-preview__frame--phone">
            <p>La vista previa está lista.</p>
            <Button onClick={() => window.open(state.url, "_blank")}>
              Abrir la vista previa
            </Button>
          </div>
        ) : (
          <>
            <iframe
              className="template-preview__frame"
              src={state.url}
              title={`Vista previa de la plantilla de ${documentName}`}
            />
            <a
              className="template-preview__open"
              href={state.url}
              target="_blank"
              rel="noreferrer"
            >
              Abrir la vista previa en otra pestaña
            </a>
          </>
        ))}
    </div>
  );
}
