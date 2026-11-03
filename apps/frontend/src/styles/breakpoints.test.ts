import { describe, expect, it } from "vitest";
import { MEDIA, resolveNamedMedia } from "./breakpoints";

describe("resolveNamedMedia", () => {
  it("writes the width of each named breakpoint", () => {
    expect(resolveNamedMedia("@media (--shell) {}")).toBe(
      `@media ${MEDIA.shell} {}`,
    );
    expect(resolveNamedMedia("@media (--above-shell) {}")).toBe(
      `@media ${MEDIA.aboveShell} {}`,
    );
    expect(resolveNamedMedia("@media (--two-columns) {}")).toBe(
      `@media ${MEDIA.twoColumns} {}`,
    );
    expect(resolveNamedMedia("@media (--wide) {}")).toBe(
      `@media ${MEDIA.wide} {}`,
    );
  });

  it("leaves everything else alone", () => {
    const css = "@media (pointer: coarse) { .a { padding: var(--space-8); } }";

    expect(resolveNamedMedia(css)).toBe(css);
  });

  it("refuses a name that doesn't exist, so a typo stops the build", () => {
    expect(() => resolveNamedMedia("@media (--phone) {}")).toThrow(
      "Unknown breakpoint: --phone",
    );
  });
});
