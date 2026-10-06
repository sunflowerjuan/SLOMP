import { request } from "./httpClient";

// Mirrors the response of POST /tax-roll/import
// (apps/backend/src/tax-roll/tax-roll.service.ts).

export interface TaxRollRowIssue {
  row: number;
  // Stable code mapped to the user-facing text in errorMessages.ts.
  code: string;
  // Developer-facing English description; not shown to the user.
  reason: string;
  details?: Record<string, unknown>;
}

export interface TaxRollConflict {
  cadastralCode: string;
  period: number;
}

export interface TaxRollPersisted {
  properties: number;
  owners: number;
  settlements: number;
  conflicts: TaxRollConflict[];
}

export interface TaxRollImportResult {
  // Valid rows aren't typed field by field: the UI only uses the counts.
  validRows: unknown[];
  invalidRows: TaxRollRowIssue[];
  warnings: TaxRollRowIssue[];
  persisted: TaxRollPersisted;
  // Id of the history entry (GET /tax-roll/imports) this upload created or
  // updated.
  importId: number;
}

export function importTaxRoll(
  file: File,
  confirmReplace: boolean,
  // Id of the previous upload being confirmed: if passed, the backend
  // updates that history entry instead of creating a new one, so an
  // already-resolved row doesn't stay stuck as "With conflicts".
  previousImportId?: number,
) {
  const form = new FormData();
  form.append("file", file);
  form.append("confirmReplace", String(confirmReplace));
  if (previousImportId !== undefined) {
    form.append("previousImportId", String(previousImportId));
  }

  return request<TaxRollImportResult>("/tax-roll/import", {
    method: "POST",
    body: form,
  });
}

// Mirrors the response of GET /tax-roll/imports
// (apps/backend/src/tax-roll/tax-roll.service.ts#listImports).
export interface TaxRollImportHistoryEntry {
  id: number;
  fileName: string;
  importedAt: string;
  validRows: number;
  invalidRows: number;
  warnings: number;
  properties: number;
  owners: number;
  settlements: number;
  conflicts: number;
  administratorEmail: string | null;
}

export function listTaxRollImports() {
  return request<TaxRollImportHistoryEntry[]>("/tax-roll/imports");
}
