import { request } from "./httpClient";

// Espejo de la respuesta de GET /settlements/search
// (apps/backend/src/settlements/settlements.service.ts).
export interface SettlementSearchResult {
  settlementId: number;
  cadastralCode: string;
  address: string;
  ownerName: string;
  period: string;
  status: "ACTIVE" | "INACTIVE";
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
