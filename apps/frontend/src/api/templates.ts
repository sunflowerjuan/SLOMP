import { request } from "./httpClient";
import { municipalityPath } from "./municipality";

// Document templates of the active municipality (SL-91). A valid upload
// becomes the active version at once; earlier versions stay and can be
// activated again.

export type TemplateDocumentType = "LIQUIDACION" | "MANDAMIENTO";

export interface TemplateVersion {
  id: number;
  documentType: TemplateDocumentType;
  version: number;
  fileName: string;
  sha256: string;
  // Markers found in the file, e.g. "cadastralCode".
  fields: string[];
  isActive: boolean;
  createdAt: string;
}

// Newest version first.
export function listTemplates(
  documentType: TemplateDocumentType,
  signal?: AbortSignal,
): Promise<TemplateVersion[]> {
  return request(municipalityPath(`/templates?documentType=${documentType}`), {
    signal,
  });
}

// Uploading the file that is already active returns that same version.
export function uploadTemplate(
  documentType: TemplateDocumentType,
  file: File,
): Promise<TemplateVersion> {
  const body = new FormData();
  body.append("documentType", documentType);
  body.append("file", file);
  return request(municipalityPath("/templates"), { method: "POST", body });
}

export function activateTemplate(id: number): Promise<TemplateVersion> {
  return request(municipalityPath(`/templates/${id}/activate`), {
    method: "POST",
  });
}
