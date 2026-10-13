import type { SettlementStatus } from "../domain/settlementStatus";
import { request, requestBlob } from "./httpClient";
import type { BlobResponse } from "./httpClient";

// Taxpayer public consultation -- an UNAUTHENTICATED channel: every call
// uses `authenticated: false`, so the Administrator's JWT is never attached
// and a 401 never ends their session. Rate-limited per municipality and IP on
// the backend (429 past the limit).
//
// Every call is scoped to ONE municipality by its slug: that is what each
// municipality's iframe talks to, and the backend only ever answers with that
// municipality's data.

export function publicConsultationPath(slug: string): string {
  return `/consulta-publica/${encodeURIComponent(slug)}`;
}

export interface PublicMunicipality {
  slug: string;
  name: string;
}

// 404 for an unknown slug: the page shows "Consulta no disponible".
export function getPublicMunicipality(slug: string, signal?: AbortSignal) {
  return request<PublicMunicipality>(publicConsultationPath(slug), {
    authenticated: false,
    signal,
  });
}

// 2 or 3 of these fields are sent. Fields the taxpayer leaves empty are NOT
// sent (not even as an empty string). The frontend only trims; the EXACT
// match is decided by the backend.
export interface PublicConsultationCriteria {
  cadastralCode?: string;
  ownerName?: string;
  address?: string;
}

// Mirrors PublicSettlementQueryResult
// (apps/backend/src/settlements/public-settlement-query.service.ts) -- one
// row per PDF: the periods of a Resolution come together. `settlementId` is
// the group's earliest period and triggers its PDF.
export interface PublicSettlement {
  settlementId: number;
  cadastralCode: string;
  address: string;
  ownerName: string;
  resolutionNumber: string | null;
  periods: number[];
  // "MIXED" only for legacy data with different statuses in one resolution.
  status: SettlementStatus | "MIXED";
  totalAmount: number;
}

// No exact match -> 200 with an empty array, never a 404 and never a
// suggestion. The page treats an empty array as "not found".
export function consultSettlements(
  slug: string,
  criteria: PublicConsultationCriteria,
  signal?: AbortSignal,
) {
  return request<PublicSettlement[]>(publicConsultationPath(slug), {
    method: "POST",
    body: criteria,
    authenticated: false,
    signal,
  });
}

// Re-sends the same criteria the search used: the backend re-validates that
// settlementId actually belongs to one of those matches before generating
// anything.
export function generateLiquidationPdf(
  slug: string,
  settlementId: number,
  criteria: PublicConsultationCriteria,
): Promise<BlobResponse> {
  return requestBlob(
    `${publicConsultationPath(slug)}/${settlementId}/liquidacion-pdf`,
    {
      method: "POST",
      body: criteria,
      authenticated: false,
    },
  );
}
