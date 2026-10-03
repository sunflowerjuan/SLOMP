import type { SettlementStatus } from "../domain/settlementStatus";
import { request } from "./httpClient";

export type { SettlementStatus };

// Mirrors the response of GET /settlements/search
// (apps/backend/src/settlements/settlements.service.ts).
export interface SettlementSearchResult {
  settlementId: number;
  cadastralCode: string;
  address: string;
  ownerName: string;
  period: number;
  status: SettlementStatus;
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

// The Administrator can force any of the 4 states manually on a current
// (non-replaced) settlement.
export function changeSettlementStatus(
  settlementId: number,
  status: SettlementStatus,
) {
  return request<{ settlementId: number; status: SettlementStatus }>(
    `/settlements/${settlementId}/status`,
    { method: "PATCH", body: { status } },
  );
}
