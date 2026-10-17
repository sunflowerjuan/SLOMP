import { describe, expect, it } from "vitest";
import {
  adminHref,
  parseAdminRoute,
  parsePublicConsultationRoute,
  publicConsultationHref,
} from "./routes";

describe("parseAdminRoute", () => {
  it("reads the municipality and the section of #/:slug/:section", () => {
    expect(parseAdminRoute("#/paez/liquidaciones")).toEqual({
      slug: "paez",
      section: "liquidaciones",
    });
    expect(parseAdminRoute("#/paez-cauca/plantillas")).toEqual({
      slug: "paez-cauca",
      section: "plantillas",
    });
    expect(parseAdminRoute("#/paez/consulta-publica?x=1")).toEqual({
      slug: "paez",
      section: "consulta-publica",
    });
  });

  it("opens Carga de Excel when the section is missing or unknown", () => {
    for (const hash of ["#/paez", "#/paez/", "#/paez/otra"]) {
      expect(parseAdminRoute(hash)).toEqual({
        slug: "paez",
        section: "cargas",
      });
    }
  });

  it("has no municipality for #/ or a section-only link from before SL-126", () => {
    expect(parseAdminRoute("")).toEqual({ slug: null, section: "cargas" });
    expect(parseAdminRoute("#/")).toEqual({ slug: null, section: "cargas" });
    expect(parseAdminRoute("#/liquidaciones")).toEqual({
      slug: null,
      section: "liquidaciones",
    });
  });

  it("keeps a malformed slug so the panel can report it", () => {
    expect(parseAdminRoute("#/Paez/cargas").slug).toBe("Paez");
    expect(parseAdminRoute("#/%E0%A4%A/cargas").slug).toBe("%E0%A4%A");
  });

  it("round-trips through adminHref", () => {
    expect(parseAdminRoute(adminHref("paez-cauca", "plantillas"))).toEqual({
      slug: "paez-cauca",
      section: "plantillas",
    });
    expect(adminHref("paez")).toBe("#/paez/cargas");
  });
});

describe("parsePublicConsultationRoute", () => {
  it("reads the municipality slug of #/consulta/:slug", () => {
    expect(parsePublicConsultationRoute("#/consulta/paez")).toEqual({
      slug: "paez",
    });
    expect(parsePublicConsultationRoute("#/consulta/paez-cauca/")).toEqual({
      slug: "paez-cauca",
    });
    expect(parsePublicConsultationRoute("#/consulta/paez?x=1")).toEqual({
      slug: "paez",
    });
  });

  it("is a public route without a municipality for #/consulta", () => {
    for (const hash of ["#/consulta", "#/consulta/", "#/consulta?x=1"]) {
      expect(parsePublicConsultationRoute(hash)).toEqual({ slug: null });
    }
  });

  it("treats a malformed slug or extra path as no municipality", () => {
    for (const hash of [
      "#/consulta/Paez",
      "#/consulta/pa ez",
      "#/consulta/-paez",
      "#/consulta/paez--x",
      "#/consulta/%E0%A4%A",
      "#/consulta/paez/otra",
      "#/consulta/..%2Fcargas",
    ]) {
      expect(parsePublicConsultationRoute(hash)).toEqual({ slug: null });
    }
  });

  it("does not take other routes for the public consultation", () => {
    for (const hash of [
      "",
      "#/",
      "#/cargas",
      "#/liquidaciones",
      "#/consulta-publica",
      "#/consultas/paez",
    ]) {
      expect(parsePublicConsultationRoute(hash)).toBeNull();
    }
  });

  it("round-trips through publicConsultationHref", () => {
    expect(
      parsePublicConsultationRoute(publicConsultationHref("paez-cauca")),
    ).toEqual({ slug: "paez-cauca" });
  });
});
