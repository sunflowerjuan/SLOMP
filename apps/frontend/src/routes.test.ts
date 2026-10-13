import { describe, expect, it } from "vitest";
import { parsePublicConsultationRoute, publicConsultationHref } from "./routes";

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
