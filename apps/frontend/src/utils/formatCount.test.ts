import { describe, expect, it } from "vitest";
import { countNoun, formatCount, formatNumber } from "./formatCount";

describe("formatNumber", () => {
  it("groups thousands with a dot from four digits on", () => {
    expect(formatNumber(1004)).toBe("1.004");
    expect(formatNumber(11202)).toBe("11.202");
    expect(formatNumber(1234567)).toBe("1.234.567");
  });

  it("leaves small numbers as they are", () => {
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(12)).toBe("12");
    expect(formatNumber(999)).toBe("999");
  });
});

describe("countNoun", () => {
  it("uses the singular only for exactly one", () => {
    expect(countNoun(1, "predio", "predios")).toBe("predio");
    expect(countNoun(0, "predio", "predios")).toBe("predios");
    expect(countNoun(12, "predio", "predios")).toBe("predios");
  });
});

describe("formatCount", () => {
  it("puts the number before its noun, in agreement", () => {
    expect(formatCount(1, "predio", "predios")).toBe("1 predio");
    expect(formatCount(12, "predio", "predios")).toBe("12 predios");
    expect(formatCount(1, "periodo", "periodos")).toBe("1 periodo");
    expect(formatCount(37, "periodo", "periodos")).toBe("37 periodos");
  });

  it("formats large counts with the thousands separator", () => {
    expect(formatCount(1004, "periodo", "periodos")).toBe("1.004 periodos");
  });
});
