import { useState } from "react";
import { getErrorMessage } from "../../api/ApiError";
import { downloadTemplateVersion } from "../../api/templates";
import type { TemplateVersion } from "../../api/templates";
import { triggerBrowserDownload } from "../../utils/downloadBlob";

// Downloads a version's .docx under the name it was saved with, one at a time.
export function useTemplateDownload() {
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState("");

  async function download(version: TemplateVersion) {
    setDownloadingId(version.id);
    setDownloadError("");
    try {
      const { blob, fileName } = await downloadTemplateVersion(version.id);
      triggerBrowserDownload(blob, fileName ?? version.fileName);
    } catch (caught) {
      setDownloadError(getErrorMessage(caught));
    } finally {
      setDownloadingId(null);
    }
  }

  return { downloadingId, downloadError, download };
}
