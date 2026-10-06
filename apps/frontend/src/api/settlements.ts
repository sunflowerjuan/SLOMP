import type { SettlementStatus } from "../domain/settlementStatus";
import { request, requestBlob } from "./httpClient";
import type { BlobResponse } from "./httpClient";

export type { SettlementStatus };

// Mirrors the response of GET /settlements/search
// (apps/backend/src/settlements/settlements.service.ts): one row per PDF, i.e.
// the periods of a property that share (or will share) a Resolution.
export interface SettlementSearchResult {
  // Any settlement of the group: the PDF and the status change cover them all.
  settlementId: number;
  resolutionNumber: string | null;
  cadastralCode: string;
  address: string;
  ownerName: string;
  periods: number[];
  // "MIXED" only for legacy data whose periods have different states.
  status: SettlementStatus | "MIXED";
  totalAmount: number;
}

export interface SettlementSearchCriteria {
  cadastralCode?: string;
  owner?: string;
  address?: string;
}

export function searchSettlements(criteria: SettlementSearchCriteria) {
  const params = new URLSearchParams();
  if (criteria.cadastralCode) {
    params.set("cadastralCode", criteria.cadastralCode);
  }
  if (criteria.owner) {
    params.set("owner", criteria.owner);
  }
  if (criteria.address) {
    params.set("address", criteria.address);
  }
  const query = params.toString();

  return request<SettlementSearchResult[]>(
    `/settlements/search${query ? `?${query}` : ""}`,
  );
}

export function generateLiquidationPdf(
  settlementId: number,
): Promise<BlobResponse> {
  return requestBlob(`/settlements/${settlementId}/liquidation-pdf`, {
    method: "POST",
  });
}

// The Administrator can force any of the 4 states manually; it applies to
// the whole group (resolution) of the given settlement.
export function changeSettlementStatus(
  settlementId: number,
  status: SettlementStatus,
) {
  return request<{ settlementId: number; status: SettlementStatus }>(
    `/settlements/${settlementId}/status`,
    { method: "PATCH", body: { status } },
  );
}
