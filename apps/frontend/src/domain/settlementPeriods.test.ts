import { describe, expect, it } from "vitest";
import type {
  SettlementPeriodStatus,
  SettlementSearchResult,
} from "../api/settlements";
import { withPeriodChanged } from "./settlementPeriods";

function period(settlementId: number): SettlementPeriodStatus {
  return {
    settlementId,
    period: 2020 + settlementId,
    status: "VIGENTE",
    allowedStatuses: ["VIGENTE", "PAGADA"],
  };
}

function row(...settlements: SettlementPeriodStatus[]): SettlementSearchResult {
  return {
    settlementId: settlements[0].settlementId,
    resolutionNumber: "LOIP 155142026-0001",
    kind: "NORMAL",
    missingPeriods: [2022],
    cadastralCode: "010000040021000",
    address: "Lote 1",
    ownerName: "Propietario",
    periods: settlements.map((settlement) => settlement.period),
    status: "VIGENTE",
    totalAmount: 1000,
    settlements,
  };
}

const paid = (settlementId: number) => ({
  settlementId,
  status: "PAGADA" as const,
  allowedStatuses: ["VIGENTE" as const, "PAGADA" as const],
  missingPeriods: [],
});

describe("withPeriodChanged", () => {
  it("changes only that period, and the row says the periods differ", () => {
    const changed = withPeriodChanged(row(period(1), period(2)), paid(2));

    expect(changed.settlements.map(({ status }) => status)).toEqual([
      "VIGENTE",
      "PAGADA",
    ]);
    expect(changed.status).toBe("MIXED");
  });

  it("goes back to one state when the last period catches up", () => {
    const first = withPeriodChanged(row(period(1), period(2)), paid(1));

    expect(withPeriodChanged(first, paid(2)).status).toBe("PAGADA");
  });

  it("shows the state of a row with a single period", () => {
    expect(withPeriodChanged(row(period(1)), paid(1)).status).toBe("PAGADA");
  });

  it("keeps the row's first period, the one its PDF goes by", () => {
    expect(withPeriodChanged(row(period(1), period(2)), paid(2))).toMatchObject(
      {
        settlementId: 1,
        periods: [2021, 2022],
      },
    );
  });

  it("takes the options and the missing periods the backend answered", () => {
    const changed = withPeriodChanged(row(period(1)), {
      ...paid(1),
      allowedStatuses: ["PAGADA"],
    });

    expect(changed.settlements[0].allowedStatuses).toEqual(["PAGADA"]);
    expect(changed.missingPeriods).toEqual([]);
  });
});
