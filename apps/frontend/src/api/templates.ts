import { ApiError } from "./ApiError";
import { request, requestBlob } from "./httpClient";
import type { BlobResponse } from "./httpClient";
import { municipalityPath } from "./municipality";

// Document templates of the active municipality. A new version only comes in
// through guided marking: the .docx is uploaded as a draft, the lawyer marks
// where each field goes, previews it and saves it, which makes it the active
// version. Earlier versions stay and can be activated again.

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

export function activateTemplate(id: number): Promise<TemplateVersion> {
  return request(municipalityPath(`/templates/${id}/activate`), {
    method: "POST",
  });
}

// The PDF service turns away a render while it is busy with another one
// (TEMPLATE_PREVIEW_FAILED): a preview asks once more before giving up.
const PREVIEW_RETRY_MS = 1500;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function previewPdf(
  render: () => Promise<BlobResponse>,
  signal?: AbortSignal,
): Promise<Blob> {
  try {
    return (await render()).blob;
  } catch (caught) {
    if (
      !(caught instanceof ApiError) ||
      caught.code !== "TEMPLATE_PREVIEW_FAILED" ||
      signal?.aborted
    ) {
      throw caught;
    }
    await wait(PREVIEW_RETRY_MS, signal);
    return (await render()).blob;
  }
}

// A saved version (active or earlier) as a PDF, filled with the same
// fictitious sample data as the draft preview.
export function previewTemplateVersion(
  id: number,
  signal?: AbortSignal,
): Promise<Blob> {
  return previewPdf(
    () => requestBlob(municipalityPath(`/templates/${id}/preview`), { signal }),
    signal,
  );
}

// The stored .docx, byte for byte, under the name it was uploaded with.
export function downloadTemplateVersion(id: number): Promise<BlobResponse> {
  return requestBlob(municipalityPath(`/templates/${id}/download`));
}

// Guided marking. `key` is the technical name the backend expects in a
// selection; only `label` and `description` are ever shown.

// TABLE_ROW: a field of the table row that repeats once per year (`rows.year`)
// or that table itself (`rows`). INLINE_LIST: a list written inside a
// sentence.
export type MarkerKind = "SCALAR" | "TABLE_ROW" | "INLINE_LIST";

export interface MarkerCatalogEntry {
  key: string;
  label: string;
  description: string;
  required: boolean;
  kind: MarkerKind;
}

// Required entries first.
export function getMarkerCatalog(
  documentType: TemplateDocumentType,
  signal?: AbortSignal,
): Promise<MarkerCatalogEntry[]> {
  return request(
    municipalityPath(`/templates/catalog?documentType=${documentType}`),
    { signal },
  );
}

export interface TemplateDraft {
  draftId: string;
  documentType: TemplateDocumentType;
  fileName: string;
  createdAt: string;
  // 24 hours after the upload.
  expiresAt: string;
}

export interface TextFragment {
  text: string;
  bold: boolean;
  italic: boolean;
}

export interface CellPosition {
  tableIndex: number;
  rowIndex: number;
  colIndex: number;
}

// One paragraph of the document, in reading order: headers, body, footers.
// `fragments` hold the same text as `text`, split where the formatting changes.
export interface DocumentBlock {
  blockId: string;
  part: "header" | "body" | "footer";
  text: string;
  table: CellPosition | null;
  fragments: TextFragment[];
}

// Text from `start` (included) to `end` (excluded) of one block, in UTF-16
// units, the same unit as JavaScript string indexes.
export interface MarkerSelection {
  blockId: string;
  start: number;
  end: number;
  field: string;
}

export interface DraftContent {
  draftId: string;
  documentType: TemplateDocumentType;
  expiresAt: string;
  blocks: DocumentBlock[];
  // The {markers} the file already had; they stay on save.
  appliedMarkers: MarkerSelection[];
}

export function createTemplateDraft(
  documentType: TemplateDocumentType,
  file: File,
): Promise<TemplateDraft> {
  const body = new FormData();
  body.append("documentType", documentType);
  body.append("file", file);
  return request(municipalityPath("/templates/drafts"), {
    method: "POST",
    body,
  });
}

function draftPath(draftId: string, path = ""): string {
  return municipalityPath(
    `/templates/drafts/${encodeURIComponent(draftId)}${path}`,
  );
}

export function getDraftContent(
  draftId: string,
  signal?: AbortSignal,
): Promise<DraftContent> {
  return request(draftPath(draftId, "/content"), { signal });
}

// Every selection, every time: the backend keeps none of them. The PDF is
// filled with fictitious sample data.
export function previewTemplateDraft(
  draftId: string,
  selections: MarkerSelection[],
  signal?: AbortSignal,
): Promise<Blob> {
  return previewPdf(
    () =>
      requestBlob(draftPath(draftId, "/preview"), {
        method: "POST",
        body: { selections },
        signal,
      }),
    signal,
  );
}

// Without `replaceConfirmed` the backend refuses to replace an active version
// (TEMPLATE_REPLACE_NOT_CONFIRMED).
export function saveTemplateDraft(
  draftId: string,
  selections: MarkerSelection[],
  replaceConfirmed: boolean,
): Promise<TemplateVersion> {
  return request(draftPath(draftId, "/save"), {
    method: "POST",
    body: { selections, replaceConfirmed },
  });
}

export function cancelTemplateDraft(draftId: string): Promise<void> {
  return request(draftPath(draftId), { method: "DELETE" });
}
