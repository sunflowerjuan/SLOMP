// What makes a row of the Liquidaciones search need attention (SL-136).
export type SettlementMark = "missing" | "risk";

export interface MarkedSettlement {
  kind: "PRESCRIPTION_RISK" | "NORMAL";
  missingPeriods: number[];
}

// The most pressing mark of a row, used for its highlight; null if none.
export function primaryMark(entry: MarkedSettlement): SettlementMark | null {
  if (entry.missingPeriods.length > 0) return "missing";
  if (entry.kind === "PRESCRIPTION_RISK") return "risk";
  return null;
}
