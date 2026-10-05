import type { SettlementStatus } from "../domain/settlementStatus";
import { request, requestBlob } from "./httpClient";
import type { BlobResponse } from "./httpClient";

// Taxpayer public consultation -- an UNAUTHENTICATED channel: every call
// uses `authenticated: false`, so the Administrator's JWT is never attached
// and a 401 never ends their session. Rate-limited per IP on the backend
// (429 past the limit).

export const PUBLIC_CONSULTATION_PATH = "/consulta-publica";

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
// row per settlement, not grouped by property, since co-owned predios list
// the same cadastralCode/address on every row.
export interface PublicSettlement {
  settlementId: number;
  cadastralCode: string;
  address: string;
  ownerName: string;
  period: number;
  status: SettlementStatus;
  issuedAt: string;
  totalAmount: number;
}

// No exact match -> 200 with an empty array, never a 404 and never a
// suggestion. The page treats an empty array as "not found".
export function consultSettlements(
  criteria: PublicConsultationCriteria,
  signal?: AbortSignal,
) {
  return request<PublicSettlement[]>(PUBLIC_CONSULTATION_PATH, {
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
  settlementId: number,
  criteria: PublicConsultationCriteria,
): Promise<BlobResponse> {
  return requestBlob(
    `${PUBLIC_CONSULTATION_PATH}/${settlementId}/liquidacion-pdf`,
    {
      method: "POST",
      body: criteria,
      authenticated: false,
    },
  );
}
