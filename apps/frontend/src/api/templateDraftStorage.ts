import { currentAdminSlug } from "../routes";
import type { MarkerSelection, TemplateDocumentType } from "./templates";

// The draft being marked in this browser, per municipality, so a reload (or a
// trip to another screen) brings the lawyer back to it while it lasts. The
// backend keeps the file but none of the selections, so they live here too;
// the file's content is always read from the backend again.
//
// The key is built on every call from this tab's URL, like the HTTP client's
// routes (null outside a municipality).
export interface StoredDraft {
  draftId: string;
  documentType: TemplateDocumentType;
  fileName: string;
  expiresAt: string;
  selections: MarkerSelection[];
  // Table rows to leave out, each named by one of its blocks.
  removedRows: string[];
}

function key(): string | null {
  const slug = currentAdminSlug();
  return slug ? `slomp.templateDraft.${slug}` : null;
}

function isSelection(value: unknown): value is MarkerSelection {
  if (typeof value !== "object" || value === null) return false;
  const { blockId, start, end, field } = value as Record<string, unknown>;
  return (
    typeof blockId === "string" &&
    typeof start === "number" &&
    typeof end === "number" &&
    typeof field === "string"
  );
}

function parse(raw: string | null): StoredDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredDraft>;
    if (
      typeof value.draftId !== "string" ||
      (value.documentType !== "LIQUIDACION" &&
        value.documentType !== "MANDAMIENTO") ||
      typeof value.fileName !== "string" ||
      typeof value.expiresAt !== "string" ||
      !Array.isArray(value.selections)
    ) {
      return null;
    }
    return {
      draftId: value.draftId,
      documentType: value.documentType,
      fileName: value.fileName,
      expiresAt: value.expiresAt,
      selections: value.selections.filter(isSelection),
      // Drafts stored before rows could be removed have none.
      removedRows: Array.isArray(value.removedRows)
        ? value.removedRows.filter(
            (row): row is string => typeof row === "string",
          )
        : [],
    };
  } catch {
    return null;
  }
}

// localStorage can throw (private mode, blocked storage); without it the flow
// still works, it just can't come back after a reload.
export function readStoredDraft(now = new Date()): StoredDraft | null {
  try {
    const current = key();
    const draft = current ? parse(localStorage.getItem(current)) : null;
    if (draft && new Date(draft.expiresAt) <= now) {
      // Expired: the backend's sweep removes its file.
      if (current) localStorage.removeItem(current);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function storeDraft(draft: StoredDraft): void {
  try {
    const current = key();
    if (current) localStorage.setItem(current, JSON.stringify(draft));
  } catch {
    // Ignored: see readStoredDraft.
  }
}

export function forgetStoredDraft(draftId: string): void {
  try {
    const current = key();
    // Another tab may already be marking a newer draft.
    if (current && parse(localStorage.getItem(current))?.draftId === draftId) {
      localStorage.removeItem(current);
    }
  } catch {
    // Ignored: see readStoredDraft.
  }
}
