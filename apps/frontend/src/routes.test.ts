import { describe, expect, it } from "vitest";
import {
  adminHref,
  adminSectionOf,
  parseAdminRoute,
  parsePublicConsultationRoute,
  publicConsultationHref,
  templatesSegmentOf,
} from "./routes";

describe("parseAdminRoute", () => {
  it("reads the municipality and the view of #/:slug/:view", () => {
    expect(parseAdminRoute("#/municipio-a/liquidaciones")).toEqual({
      slug: "municipio-a",
      view: "liquidaciones",
      isAlias: false,
    });
    expect(parseAdminRoute("#/municipio-b/configuracion/?x=1")).toEqual({
      slug: "municipio-b",
      view: "configuracion",
      isAlias: false,
    });
    expect(
      parseAdminRoute("#/municipio-a/configuracion/plantillas/mandamiento"),
    ).toEqual({
      slug: "municipio-a",
      view: "configuracion/plantillas/mandamiento",
      isAlias: false,
    });
  });

  it("takes the old addresses of Plantillas, Consulta pública and the tabs of Configuración to its panel", () => {
    for (const hash of [
      "#/municipio-a/plantillas",
      "#/municipio-a/consulta-publica?x=1",
      "#/municipio-a/configuracion/plantillas",
      "#/municipio-a/configuracion/consulta",
    ]) {
      expect(parseAdminRoute(hash)).toEqual({
        slug: "municipio-a",
        view: "configuracion",
        isAlias: true,
      });
    }
  });

  it("opens Cartera when the view is missing or unknown", () => {
    for (const hash of [
      "#/municipio-a",
      "#/municipio-a/",
      "#/municipio-a/otra",
      "#/municipio-a/configuracion/otra",
      "#/municipio-a/liquidaciones/otra",
    ]) {
      expect(parseAdminRoute(hash)).toEqual({
        slug: "municipio-a",
        view: "cargas",
        isAlias: false,
      });
    }
  });

  it("has no municipality for #/ or a view-only link from before SL-126", () => {
    expect(parseAdminRoute("")).toEqual({
      slug: null,
      view: "cargas",
      isAlias: false,
    });
    expect(parseAdminRoute("#/")).toEqual({
      slug: null,
      view: "cargas",
      isAlias: false,
    });
    expect(parseAdminRoute("#/liquidaciones")).toEqual({
      slug: null,
      view: "liquidaciones",
      isAlias: false,
    });
    expect(parseAdminRoute("#/plantillas")).toEqual({
      slug: null,
      view: "configuracion",
      isAlias: true,
    });
  });

  it("keeps a malformed slug so the panel can report it", () => {
    expect(parseAdminRoute("#/Municipio-A/cargas").slug).toBe("Municipio-A");
    expect(parseAdminRoute("#/%E0%A4%A/cargas").slug).toBe("%E0%A4%A");
  });

  it("round-trips every view through adminHref", () => {
    for (const view of [
      "cargas",
      "liquidaciones",
      "mandamientos",
      "configuracion",
      "configuracion/plantillas/liquidacion",
      "configuracion/plantillas/mandamiento",
    ] as const) {
      expect(parseAdminRoute(adminHref("municipio-b", view))).toEqual({
        slug: "municipio-b",
        view,
        isAlias: false,
      });
    }
    expect(adminHref("municipio-a")).toBe("#/municipio-a/cargas");
    expect(adminHref("municipio-a", "configuracion")).toBe(
      "#/municipio-a/configuracion",
    );
  });
});

describe("adminSectionOf and templatesSegmentOf", () => {
  it("keeps Configuración and the templates of each document under its menu entry", () => {
    expect(adminSectionOf("configuracion")).toBe("configuracion");
    expect(adminSectionOf("configuracion/plantillas/mandamiento")).toBe(
      "configuracion",
    );
    expect(templatesSegmentOf("configuracion/plantillas/mandamiento")).toBe(
      "mandamiento",
    );
    expect(templatesSegmentOf("configuracion")).toBeNull();
  });

  it("does not take an unknown document as a templates screen", () => {
    expect(
      parseAdminRoute("#/municipio-a/configuracion/plantillas/otra").view,
    ).toBe("cargas");
  });

  it("leaves the other views as their own entry", () => {
    for (const view of ["cargas", "liquidaciones", "mandamientos"] as const) {
      expect(adminSectionOf(view)).toBe(view);
      expect(templatesSegmentOf(view)).toBeNull();
    }
  });
});

describe("parsePublicConsultationRoute", () => {
  it("reads the municipality slug of #/consulta/:slug", () => {
    expect(parsePublicConsultationRoute("#/consulta/municipio-a")).toEqual({
      slug: "municipio-a",
    });
    expect(parsePublicConsultationRoute("#/consulta/municipio-b/")).toEqual({
      slug: "municipio-b",
    });
    expect(parsePublicConsultationRoute("#/consulta/municipio-a?x=1")).toEqual({
      slug: "municipio-a",
    });
  });

  it("is a public route without a municipality for #/consulta", () => {
    for (const hash of ["#/consulta", "#/consulta/", "#/consulta?x=1"]) {
      expect(parsePublicConsultationRoute(hash)).toEqual({ slug: null });
    }
  });

  it("treats a malformed slug or extra path as no municipality", () => {
    for (const hash of [
      "#/consulta/Municipio-A",
      "#/consulta/municipio a",
      "#/consulta/-municipio-a",
      "#/consulta/municipio-a--x",
      "#/consulta/%E0%A4%A",
      "#/consulta/municipio-a/otra",
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
      "#/municipio-a/configuracion",
      "#/consultas/municipio-a",
    ]) {
      expect(parsePublicConsultationRoute(hash)).toBeNull();
    }
  });

  it("round-trips through publicConsultationHref", () => {
    expect(
      parsePublicConsultationRoute(publicConsultationHref("municipio-b")),
    ).toEqual({ slug: "municipio-b" });
  });
});
