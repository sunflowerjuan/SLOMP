import type { SettlementStatus } from "../domain/settlementStatus";
import { request } from "./httpClient";

export type { SettlementStatus };

// Espejo de la respuesta de GET /settlements/search
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

// RF-10: el Administrador puede forzar manualmente cualquiera de los 4
// estados sobre una liquidacion vigente (no reemplazada).
export function changeSettlementStatus(
  settlementId: number,
  status: SettlementStatus,
) {
  return request<{ settlementId: number; status: SettlementStatus }>(
    `/settlements/${settlementId}/status`,
    { method: "PATCH", body: { status } },
  );
}
