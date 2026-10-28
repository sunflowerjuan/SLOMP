import { describe, expect, it } from "vitest";
import {
  filterByCadastralCode,
  generationRows,
  groupEligibleByProperty,
  groupIneligible,
  groupIneligibleByReason,
  issuedFromOrders,
  newestFirst,
  rejectedPeriods,
  reviewSummary,
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

const candidate = (code: string, settlementIds: number[]) => ({
  cadastralCode: code,
  periods: settlementIds.map((id) => 2018 + id),
  settlementIds,
  resolutionNumbers: ["2026-0001"],
});

describe("reviewSummary", () => {
  it("counts the properties once and agrees with each count", () => {
    expect(
      reviewSummary({
        eligible: [{ cadastralCode: CODE_A }, { cadastralCode: CODE_A }],
        ineligible: [{ cadastralCode: CODE_A }, { cadastralCode: CODE_B }],
      }),
    ).toBe("2 predios, 2 periodos elegibles, 2 no elegibles");
  });

  it("uses the singular for one", () => {
    expect(
      reviewSummary({
        eligible: [{ cadastralCode: CODE_A }],
        ineligible: [{ cadastralCode: CODE_A }],
      }),
    ).toBe("1 predio, 1 periodo elegible, 1 no elegible");
  });
});

describe("groupIneligibleByReason", () => {
  it("lists the reasons in a fixed order, each with its periods", () => {
    const result = groupIneligibleByReason([
      {
        cadastralCode: CODE_B,
        period: 2018,
        settlementId: null,
        reason: "SETTLEMENT_NOT_FOUND",
      },
      {
        cadastralCode: CODE_A,
        period: 2023,
        settlementId: 4,
        reason: "NOT_YET_FIRM",
        firmOn: "2026-12-01T00:00:00.000Z",
      },
      {
        cadastralCode: CODE_B,
        period: 2024,
        settlementId: 5,
        reason: "NOT_YET_FIRM",
        firmOn: "2026-12-01T00:00:00.000Z",
      },
    ]);
    expect(
      result.map(({ reason, periods, groups }) => [
        reason,
        periods,
        groups.map((group) => group.cadastralCode),
      ]),
    ).toEqual([
      ["NOT_YET_FIRM", 2, [CODE_A, CODE_B]],
      ["SETTLEMENT_NOT_FOUND", 1, [CODE_B]],
    ]);
  });

  it("has no groups without ineligible periods", () => {
    expect(groupIneligibleByReason([])).toEqual([]);
  });
});

describe("generationRows", () => {
  it("keeps the rows issued here when the Excel no longer offers them", () => {
    const issuedA = {
      candidate: candidate(CODE_A, [1, 2]),
      paymentOrderId: 9,
      number: "2026-0001",
    };
    expect(
      generationRows([candidate(CODE_B, [3])], { [CODE_A]: issuedA }).map(
        (row) => row.cadastralCode,
      ),
    ).toEqual([CODE_A, CODE_B]);
  });

  it("shows the issued row as it was issued, not as reviewed again", () => {
    const issued = candidate(CODE_A, [1, 2]);
    const reviewedAgain = candidate(CODE_A, [2]);
    expect(
      generationRows([reviewedAgain], {
        [CODE_A]: { candidate: issued, paymentOrderId: 9, number: "2026-0001" },
      }),
    ).toEqual([issued]);
  });
});

describe("issuedFromOrders", () => {
  it("matches each candidate with the order that covers its settlements", () => {
    const orders = [
      {
        id: 21,
        number: "2026-0003",
        issuedAt: "2026-10-27T20:00:00.000Z",
        cadastralCode: CODE_A,
        settlementIds: [1, 2],
        periods: [2019, 2020],
      },
      {
        id: 20,
        number: "2026-0002",
        issuedAt: "2026-10-01T20:00:00.000Z",
        cadastralCode: CODE_B,
        settlementIds: [8],
        periods: [2018],
      },
    ];
    expect(
      issuedFromOrders(
        [candidate(CODE_A, [1, 2]), candidate(CODE_B, [3])],
        orders,
      ),
    ).toEqual({
      [CODE_A]: {
        candidate: candidate(CODE_A, [1, 2]),
        paymentOrderId: 21,
        number: "2026-0003",
      },
    });
  });
});

describe("filterByCadastralCode", () => {
  const order = (id: number, cadastralCode: string) => ({
    id,
    number: `2026-000${id}`,
    issuedAt: "2026-10-27T20:00:00.000Z",
    cadastralCode,
    settlementIds: [id],
    periods: [2020],
  });
  const orders = [order(1, CODE_A), order(2, CODE_B)];

  it("finds a code by any part of it, with or without separators", () => {
    expect(filterByCadastralCode(orders, "0000000002")).toEqual([orders[1]]);
    expect(filterByCadastralCode(orders, "15514-0000")).toEqual(orders);
  });

  it("returns everything for an empty search", () => {
    expect(filterByCadastralCode(orders, "  ")).toEqual(orders);
  });
});
