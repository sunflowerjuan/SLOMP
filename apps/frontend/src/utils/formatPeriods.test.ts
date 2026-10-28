import { describe, expect, it } from "vitest";
import { describePeriods, formatPeriods } from "./formatPeriods";

describe("formatPeriods", () => {
  it("joins consecutive periods into a range", () => {
    expect(formatPeriods([2018, 2019, 2020, 2023])).toBe("2018–2020, 2023");
    expect(formatPeriods([2019, 2020])).toBe("2019–2020");
    expect(formatPeriods([2016, 2017, 2018, 2019, 2020])).toBe("2016–2020");
  });

  it("lists periods with gaps one by one", () => {
    expect(formatPeriods([2018, 2020, 2022])).toBe("2018, 2020, 2022");
    expect(formatPeriods([2015, 2018, 2019, 2021, 2022])).toBe(
      "2015, 2018–2019, 2021–2022",
    );
  });

  it("shows a single period as it is", () => {
    expect(formatPeriods([2020])).toBe("2020");
  });

  it("is empty without periods", () => {
    expect(formatPeriods([])).toBe("");
  });

  it("does not sort: only ascending neighbors make a range", () => {
    expect(formatPeriods([2020, 2018, 2019])).toBe("2020, 2018–2019");
    expect(formatPeriods([2021, 2020])).toBe("2021, 2020");
  });
});

describe("describePeriods", () => {
  it("names the periods in agreement with how many there are", () => {
    expect(describePeriods([2020])).toBe("periodo 2020");
    expect(describePeriods([2018, 2019])).toBe("periodos 2018–2019");
    expect(describePeriods([2018, 2020])).toBe("periodos 2018, 2020");
  });
});
