import { request } from "./httpClient";

// Espejo de la respuesta de POST /tax-roll/import
// (apps/backend/src/tax-roll/tax-roll.service.ts).

export interface TaxRollRowIssue {
  row: number;
  reason: string;
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
  // Las filas validas no se tipan campo a campo: la UI solo usa los conteos.
  validRows: unknown[];
  invalidRows: TaxRollRowIssue[];
  warnings: TaxRollRowIssue[];
  persisted: TaxRollPersisted;
  // Id del registro en el historial (GET /tax-roll/imports) que esta carga
  // creo o actualizo.
  importId: number;
}

export function importTaxRoll(
  file: File,
  confirmReplace: boolean,
  // Id de la carga anterior que se esta confirmando (HU18): si se pasa, el
  // backend actualiza ese registro del historial en vez de crear uno
  // nuevo, para que no quede una fila "Con conflictos" ya resuelta.
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

// Espejo de la respuesta de GET /tax-roll/imports
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
