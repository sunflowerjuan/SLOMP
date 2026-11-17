import { request } from "./httpClient";
import { municipalityPath } from "./municipality";

// Mirrors GET /municipalities/:slug/alerts/summary
// (apps/backend/src/settlements/alert-rules.ts): counts only.
export interface AlertsSummary {
  prescriptionRisk: {
    count: number;
    byPeriod: { period: number; count: number }[];
  };
  // count = liquidaciones; properties = predios distintos.
  missingPeriods: { count: number; properties: number };
}

export function getAlertsSummary() {
  return request<AlertsSummary>(municipalityPath("/alerts/summary"));
}
