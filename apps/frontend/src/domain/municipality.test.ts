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
    expect(municipalityLabel({ name: "Ejemplo", state: "Norte" })).toBe(
      "Ejemplo, Norte",
    );
    expect(municipalityLabel({ name: "Ejemplo", state: "Sur" })).toBe(
      "Ejemplo, Sur",
    );
  });
});

describe("suggestSlug", () => {
  it("drops accents, case and anything that isn't a letter or digit", () => {
    expect(suggestSlug("Peñón Ejemplo")).toBe("penon-ejemplo");
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

  it.each([
    ["-ejemplo", "ejemplo"],
    ["--ejemplo", "ejemplo"],
    ["ejemplo-", "ejemplo"],
    ["ejemplo--", "ejemplo"],
    ["--villa--de--leyva--", "villa-de-leyva"],
    ["- -villa- -", "villa"],
    ["---", ""],
    ["", ""],
  ])('drops leading, trailing and repeated hyphens: "%s"', (name, slug) => {
    expect(suggestSlug(name)).toBe(slug);
  });

  it("cuts a long name to the maximum length", () => {
    expect(suggestSlug("a".repeat(100))).toBe("a".repeat(60));
    expect(suggestSlug(`${"a".repeat(59)} b`)).toBe("a".repeat(59));
    expect(suggestSlug(`${"-".repeat(10)}${"a".repeat(70)}`)).toBe(
      "a".repeat(60),
    );
  });

  it("handles 100 000 hyphens in linear time", () => {
    const started = performance.now();
    expect(suggestSlug("-".repeat(100_000))).toBe("");
    expect(suggestSlug(`a${"-".repeat(100_000)}`)).toBe("a");
    expect(suggestSlug(`${"-".repeat(100_000)}a`)).toBe("a");
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(isValidSlug("municipio-a")).toBe(true);
    expect(isValidSlug("municipio-b")).toBe(true);
    expect(isValidSlug("villa2")).toBe(true);
  });

  it("rejects anything the backend would reject", () => {
    for (const slug of [
      "",
      "Municipio-A",
      "municipio--b",
      "-municipio-a",
      "municipio-a-",
      "peñón-ejemplo",
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
    expect(isReservedSlug("municipio-a")).toBe(false);
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
      { name: "Zeta", state: "Norte" },
      { name: "Ejemplo", state: "Sur" },
      { name: "Ébano", state: "Norte" },
      { name: "Ejemplo", state: "Norte" },
    ]);
    expect(sorted.map(municipalityLabel)).toEqual([
      "Ébano, Norte",
      "Ejemplo, Norte",
      "Ejemplo, Sur",
      "Zeta, Norte",
    ]);
  });
});

describe("pickInitialMunicipality", () => {
  const list = [{ slug: "municipio-a" }, { slug: "municipio-b" }];

  it("opens the last municipality used in this browser", () => {
    expect(pickInitialMunicipality(list, "municipio-b")).toEqual({
      slug: "municipio-b",
    });
  });

  it("falls back to the first when the last one is unknown or missing", () => {
    expect(pickInitialMunicipality(list, "otro")).toEqual({
      slug: "municipio-a",
    });
    expect(pickInitialMunicipality(list, null)).toEqual({
      slug: "municipio-a",
    });
  });

  it("has nothing to open without municipalities", () => {
    expect(pickInitialMunicipality([], "municipio-a")).toBeNull();
  });
});
