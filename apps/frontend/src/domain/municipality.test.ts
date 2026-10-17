import { describe, expect, it } from "vitest";
import {
  isReservedSlug,
  isValidDaneCode,
  isValidSlug,
  municipalityLabel,
  pickInitialMunicipality,
  sortMunicipalities,
  suggestSlug,
} from "./municipality";

describe("municipalityLabel", () => {
  it("adds the department, so namesakes stay apart", () => {
    expect(municipalityLabel({ name: "Páez", state: "Boyacá" })).toBe(
      "Páez, Boyacá",
    );
    expect(municipalityLabel({ name: "Páez", state: "Cauca" })).toBe(
      "Páez, Cauca",
    );
  });
});

describe("suggestSlug", () => {
  it("drops accents, case and anything that isn't a letter or digit", () => {
    expect(suggestSlug("Páez")).toBe("paez");
    expect(suggestSlug("San José de Pare")).toBe("san-jose-de-pare");
    expect(suggestSlug("  Villa de Leyva!! ")).toBe("villa-de-leyva");
    expect(suggestSlug("Güicán de la Sierra")).toBe("guican-de-la-sierra");
  });

  it("never ends in a hyphen after cutting it to the maximum length", () => {
    const slug = suggestSlug(`${"a".repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("suggests nothing for a name without letters or digits", () => {
    expect(suggestSlug("¡¿?!")).toBe("");
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(isValidSlug("paez")).toBe(true);
    expect(isValidSlug("paez-cauca")).toBe(true);
    expect(isValidSlug("villa2")).toBe(true);
  });

  it("rejects anything the backend would reject", () => {
    for (const slug of [
      "",
      "Paez",
      "paez--cauca",
      "-paez",
      "paez-",
      "pá-ez",
      "a".repeat(61),
    ]) {
      expect(isValidSlug(slug)).toBe(false);
    }
  });
});

describe("isReservedSlug", () => {
  it("keeps the public consultation's address free", () => {
    expect(isReservedSlug("consulta")).toBe(true);
    expect(isReservedSlug("consulta-publica")).toBe(false);
    expect(isReservedSlug("paez")).toBe(false);
  });
});

describe("isValidDaneCode", () => {
  it("is exactly 5 digits", () => {
    expect(isValidDaneCode("15514")).toBe(true);
    for (const code of ["1551", "155140", "15a14", " 15514", ""]) {
      expect(isValidDaneCode(code)).toBe(false);
    }
  });
});

describe("sortMunicipalities", () => {
  it("orders by name, then department, ignoring accents", () => {
    const sorted = sortMunicipalities([
      { name: "Tunja", state: "Boyacá" },
      { name: "Páez", state: "Cauca" },
      { name: "Paipa", state: "Boyacá" },
      { name: "Páez", state: "Boyacá" },
    ]);
    expect(sorted.map(municipalityLabel)).toEqual([
      "Páez, Boyacá",
      "Páez, Cauca",
      "Paipa, Boyacá",
      "Tunja, Boyacá",
    ]);
  });
});

describe("pickInitialMunicipality", () => {
  const list = [{ slug: "paez" }, { slug: "paez-cauca" }];

  it("opens the last municipality used in this browser", () => {
    expect(pickInitialMunicipality(list, "paez-cauca")).toEqual({
      slug: "paez-cauca",
    });
  });

  it("falls back to the first when the last one is unknown or missing", () => {
    expect(pickInitialMunicipality(list, "otro")).toEqual({ slug: "paez" });
    expect(pickInitialMunicipality(list, null)).toEqual({ slug: "paez" });
  });

  it("has nothing to open without municipalities", () => {
    expect(pickInitialMunicipality([], "paez")).toBeNull();
  });
});
