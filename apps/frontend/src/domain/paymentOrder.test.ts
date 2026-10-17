import { describe, expect, it } from "vitest";
import {
  groupEligibleByProperty,
  groupIneligible,
  newestFirst,
  rejectedPeriods,
} from "./paymentOrder";

const CODE_A = "155140000000000000000000000001";
const CODE_B = "155140000000000000000000000002";

describe("groupEligibleByProperty", () => {
  it("makes one payment order per property with its periods in order", () => {
    expect(
      groupEligibleByProperty([
        {
          cadastralCode: CODE_B,
          period: 2020,
          settlementId: 7,
          resolutionNumber: "2026-0002",
        },
        {
          cadastralCode: CODE_A,
          period: 2022,
          settlementId: 3,
          resolutionNumber: "2026-0001",
        },
        {
          cadastralCode: CODE_A,
          period: 2019,
          settlementId: 1,
          resolutionNumber: "2026-0003",
        },
        {
          cadastralCode: CODE_A,
          period: 2021,
          settlementId: 2,
          resolutionNumber: "2026-0003",
        },
      ]),
    ).toEqual([
      {
        cadastralCode: CODE_A,
        periods: [2019, 2021, 2022],
        settlementIds: [1, 2, 3],
        resolutionNumbers: ["2026-0003", "2026-0001"],
      },
      {
        cadastralCode: CODE_B,
        periods: [2020],
        settlementIds: [7],
        resolutionNumbers: ["2026-0002"],
      },
    ]);
  });

  it("has nothing to generate without eligible rows", () => {
    expect(groupEligibleByProperty([])).toEqual([]);
  });
});

describe("newestFirst", () => {
  it("puts the latest first and orders a bulk job by number", () => {
    const order = (id: number, issuedAt: string) => ({
      id,
      number: `2026-000${id}`,
      issuedAt,
      cadastralCode: CODE_A,
      settlementIds: [id],
      periods: [2020],
    });
    const bulk = "2026-10-17T03:48:00.000Z";
    expect(
      newestFirst([
        order(1, "2026-10-17T03:47:00.000Z"),
        order(3, bulk),
        order(4, bulk),
        order(2, bulk),
      ]).map((entry) => entry.id),
    ).toEqual([4, 3, 2, 1]);
  });
});

describe("rejectedPeriods", () => {
  it("names the periods whose settlements were rejected", () => {
    const candidate = {
      cadastralCode: CODE_A,
      periods: [2019, 2021, 2022],
      settlementIds: [1, 2, 3],
      resolutionNumbers: ["2026-0001"],
    };
    expect(
      rejectedPeriods(candidate, [{ settlementId: 3 }, { settlementId: 1 }]),
    ).toEqual([2019, 2022]);
    expect(rejectedPeriods(candidate, [])).toEqual([]);
  });
});

describe("groupIneligible", () => {
  it("joins the periods of a property that share reason and date", () => {
    expect(
      groupIneligible([
        {
          cadastralCode: CODE_A,
          period: 2021,
          settlementId: 2,
          reason: "ALREADY_HAS_PAYMENT_ORDER",
        },
        {
          cadastralCode: CODE_A,
          period: 2019,
          settlementId: 1,
          reason: "ALREADY_HAS_PAYMENT_ORDER",
        },
        {
          cadastralCode: CODE_A,
          period: 2023,
          settlementId: 4,
          reason: "NOT_YET_FIRM",
          firmOn: "2026-12-01T00:00:00.000Z",
        },
        {
          cadastralCode: CODE_A,
          period: 2024,
          settlementId: 5,
          reason: "NOT_YET_FIRM",
          firmOn: "2026-12-20T00:00:00.000Z",
        },
        {
          cadastralCode: CODE_B,
          period: 2018,
          settlementId: null,
          reason: "SETTLEMENT_NOT_FOUND",
        },
      ]),
    ).toEqual([
      {
        cadastralCode: CODE_A,
        periods: [2019, 2021],
        reason: "ALREADY_HAS_PAYMENT_ORDER",
      },
      {
        cadastralCode: CODE_A,
        periods: [2023],
        reason: "NOT_YET_FIRM",
        firmOn: "2026-12-01T00:00:00.000Z",
      },
      {
        cadastralCode: CODE_A,
        periods: [2024],
        reason: "NOT_YET_FIRM",
        firmOn: "2026-12-20T00:00:00.000Z",
      },
      {
        cadastralCode: CODE_B,
        periods: [2018],
        reason: "SETTLEMENT_NOT_FOUND",
      },
    ]);
  });
});
