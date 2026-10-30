import { useEffect, useState } from "react";
import { getErrorMessage } from "../../api/ApiError";
import { getTemplateContent } from "../../api/templates";
import type { TemplateContent, TemplateVersion } from "../../api/templates";
import { Button } from "../../components/ui/Button";
import { Notice } from "../../components/ui/Notice";
import { TemplateDocument } from "./TemplateDocument";

type ContentState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; content: TemplateContent };

// What a saved version says, read from its file.
export function VersionContent({ version }: { version: TemplateVersion }) {
  const [state, setState] = useState<ContentState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getTemplateContent(version.id, controller.signal)
      .then((content) => setState({ status: "ready", content }))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: getErrorMessage(caught, { document: version.documentType }),
        });
      });
    return () => controller.abort();
  }, [version.id, version.documentType, attempt]);

  if (state.status === "loading") {
    return (
      <div className="template-preview__frame template-preview__frame--loading">
        <span className="template-preview__spinner" aria-hidden="true" />
        <p role="status">Cargando la plantilla…</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <Notice className="template-preview__error">
        {state.message}
        <Button
          variant="secondary"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((current) => current + 1);
          }}
        >
          Reintentar
        </Button>
      </Notice>
    );
  }

  return (
    <div className="template-viewer__document">
      <TemplateDocument content={state.content} />
    </div>
  );
}
