import { useEffect, useState } from "react";
import { getErrorMessage } from "../../api/ApiError";
import { previewTemplateVersion } from "../../api/templates";
import type { TemplateVersion } from "../../api/templates";
import { TemplatePreview } from "./TemplatePreview";
import type { PreviewState } from "./TemplatePreview";

interface VersionPreviewProps {
  version: TemplateVersion;
  // "liquidación" or "mandamiento".
  documentName: string;
}

// A saved version as it prints, filled with the sample data.
export function VersionPreview({ version, documentName }: VersionPreviewProps) {
  const [preview, setPreview] = useState<PreviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

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

  return (
    <TemplatePreview
      state={preview}
      documentName={documentName}
      onRetry={() => {
        setPreview({ status: "loading" });
        setAttempt((current) => current + 1);
      }}
    />
  );
}
