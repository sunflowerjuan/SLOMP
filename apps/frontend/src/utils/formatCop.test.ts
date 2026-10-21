import { describe, expect, it } from "vitest";
import { formatCop } from "./formatCop";

const plain = (text: string) => text.replace(/\s/g, " ");

describe("formatCop", () => {
  it("shows whole pesos without decimals", () => {
    expect(plain(formatCop(1284500))).toBe("$ 1.284.500");
  });

  it("shows cents with two digits, never one", () => {
    expect(plain(formatCop(285375.5))).toBe("$ 285.375,50");
  });

  it("keeps 8 and 9 digit amounts complete", () => {
    expect(plain(formatCop(12345678))).toBe("$ 12.345.678");
    expect(plain(formatCop(987654321.5))).toBe("$ 987.654.321,50");
  });

  it("formats zero", () => {
    expect(plain(formatCop(0))).toBe("$ 0");
  });
});
