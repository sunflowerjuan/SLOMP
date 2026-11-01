import { describe, expect, it } from "vitest";
import type {
  AcceptedStatusChange,
  AssistantSettlement,
  RejectedStatusChange,
} from "../api/assistant";
import type { PaymentOrderImportPreview } from "../api/paymentOrders";
import {
  appliedPeriods,
  groupPeriods,
  paymentOrderContextRows,
  pendingUnlisted,
  proposalLevel,
  rejectedTargets,
  targetStatuses,
  toProposal,
  unlistedScope,
  unlistedTargets,
} from "./slompsim";

const CODE_A = "010000040021000";
const CODE_B = "010000040022000";

function settlement(
  id: number,
  overrides: Partial<AssistantSettlement> = {},
): AssistantSettlement {
  return {
    id,
    cadastralCode: CODE_A,
    period: 2020,
    status: "EN_FIRME",
    allowedStatuses: ["EN_FIRME", "PAGADA", "ACUERDO_DE_PAGO", "PRESCRITA"],
    hasPaymentOrder: false,
    resolutionNumber: "LOIP 155142026-0003",
    ...overrides,
  };
}

function change(
  settlementId: number,
  overrides: Partial<AcceptedStatusChange> = {},
): AcceptedStatusChange {
  return {
    settlementId,
    cadastralCode: CODE_A,
    period: 2020,
    resolutionNumber: null,
    from: "EN_FIRME",
    to: "PAGADA",
    ...overrides,
  };
}

function rejection(
  settlementId: number,
  overrides: Partial<RejectedStatusChange> = {},
): RejectedStatusChange {
  return {
    settlementId,
    to: "PRESCRITA",
    reason: "TRANSITION_NOT_ALLOWED",
    allowed: ["EN_FIRME", "PAGADA", "ACUERDO_DE_PAGO"],
    current: "EN_FIRME",
    ...overrides,
  };
}

describe("toProposal and proposalLevel", () => {
  it("separates what would change from what already has the state", () => {
    const proposal = toProposal({
      accepted: [change(1), change(2, { from: "PAGADA" })],
      rejected: [rejection(3)],
      note: "Pagó en ventanilla",
    });

    expect(proposal.changes.map((item) => item.settlementId)).toEqual([1]);
    expect(proposal.unchanged.map((item) => item.settlementId)).toEqual([2]);
    expect(proposal.rejected).toHaveLength(1);
    expect(proposal.note).toBe("Pagó en ventanilla");
  });

  it("lists the changes by property and period, whatever the model's order", () => {
    const proposal = toProposal({
      accepted: [
        change(1, { cadastralCode: CODE_B, period: 2019 }),
        change(2, { period: 2021 }),
        change(3, { period: 2020 }),
      ],
      rejected: [],
    });

    expect(proposal.changes.map((item) => item.settlementId)).toEqual([
      3, 2, 1,
    ]);
  });

  it("gets the level from what would really change", () => {
    const levels: [AcceptedStatusChange[], RejectedStatusChange[], number][] = [
      [[], [rejection(1)], 1],
      [[change(1, { from: "PAGADA" })], [], 1],
      [[change(1)], [], 2],
      [[change(1), change(2, { from: "PAGADA" })], [], 2],
      [[change(1)], [rejection(2), rejection(3)], 2],
      [[change(1), change(2)], [], 3],
      [[change(1), change(2)], [rejection(3)], 3],
    ];
    for (const [accepted, rejected, level] of levels) {
      expect(proposalLevel(toProposal({ accepted, rejected }))).toBe(level);
    }
  });

  it("lists each target state once and the periods in order", () => {
    const changes = [
      change(1, { period: 2021 }),
      change(2, { period: 2019 }),
      change(3, { period: 2021, to: "ACUERDO_DE_PAGO" }),
    ];

    expect(targetStatuses(changes)).toEqual(["PAGADA", "ACUERDO_DE_PAGO"]);
    expect(appliedPeriods(changes)).toEqual([2019, 2021]);
  });
});

describe("rejectedTargets", () => {
  it("offers where they can go, not the state they are in or the one rejected", () => {
    expect(rejectedTargets([rejection(1)])).toEqual([
      "PAGADA",
      "ACUERDO_DE_PAGO",
    ]);
  });

  it("offers only what all of them allow", () => {
    expect(
      rejectedTargets([
        rejection(1),
        rejection(2, { allowed: ["EN_FIRME", "PAGADA"] }),
        rejection(3, { allowed: ["PAGADA", "ACUERDO_DE_PAGO"] }),
      ]),
    ).toEqual(["PAGADA"]);
  });

  it("offers nothing when the settlement can't change", () => {
    expect(rejectedTargets([])).toEqual([]);
    expect(
      rejectedTargets([rejection(1, { reason: "NOT_FOUND", allowed: [] })]),
    ).toEqual([]);
  });
});

describe("the periods the Excel leaves out", () => {
  it("leaves out only the periods in a payment order or already paid", () => {
    const rows = [
      settlement(1),
      settlement(2, { status: "VIGENTE" }),
      settlement(3, { status: "PAGADA" }),
      settlement(4, { status: "ACUERDO_DE_PAGO" }),
      settlement(5, { status: "PRESCRITA" }),
      settlement(6, { hasPaymentOrder: true }),
    ];

    expect(pendingUnlisted(rows).map(({ id }) => id)).toEqual([1, 2, 4, 5]);
  });

  it("offers the default state first, and only what every period allows", () => {
    expect(unlistedTargets([settlement(1)])).toEqual([
      "PRESCRITA",
      "PAGADA",
      "ACUERDO_DE_PAGO",
    ]);
    expect(
      unlistedTargets([
        settlement(1),
        settlement(2, { allowedStatuses: ["EN_FIRME", "PAGADA"] }),
      ]),
    ).toEqual(["PAGADA"]);
  });

  it("groups them by property and state, with the periods in order", () => {
    expect(
      groupPeriods([
        settlement(1, { cadastralCode: CODE_B, period: 2021 }),
        settlement(2, { period: 2021 }),
        settlement(3, { period: 2020 }),
        settlement(4, { period: 2019, status: "VIGENTE" }),
      ]),
    ).toEqual([
      { cadastralCode: CODE_A, status: "EN_FIRME", periods: [2020, 2021] },
      { cadastralCode: CODE_A, status: "VIGENTE", periods: [2019] },
      { cadastralCode: CODE_B, status: "EN_FIRME", periods: [2021] },
    ]);
  });

  it("says how many periods of how many properties", () => {
    expect(
      unlistedScope([
        settlement(1),
        settlement(2),
        settlement(3, { cadastralCode: CODE_B }),
      ]),
    ).toEqual({ periods: "3 periodos", properties: "2 predios" });
    expect(unlistedScope([settlement(1)])).toEqual({
      periods: "1 periodo",
      properties: "1 predio",
    });
  });
});

describe("paymentOrderContextRows", () => {
  const preview = (rows: number): PaymentOrderImportPreview => ({
    fileName: "mandamientos.xlsx",
    rows,
    eligible: Array.from({ length: rows }, (_, index) => ({
      cadastralCode: CODE_A,
      period: 1980 + index,
      settlementId: index + 1,
      resolutionNumber: "LOIP 155142026-0003",
    })),
    ineligible: [
      {
        cadastralCode: CODE_B,
        period: 2020,
        settlementId: null,
        reason: "SETTLEMENT_NOT_FOUND",
      },
    ],
    invalidRows: [],
    warnings: [],
    unlisted: [settlement(90)],
  });

  it("keeps only the code and period of the properties with periods left out", () => {
    expect(paymentOrderContextRows(preview(1))).toEqual([
      { cadastralCode: CODE_A, period: 1980 },
    ]);
  });

  it("never goes over what the endpoint accepts", () => {
    expect(paymentOrderContextRows(preview(6000))).toHaveLength(5000);
  });
});
