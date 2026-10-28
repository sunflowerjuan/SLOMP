import { describe, expect, it } from "vitest";
import {
  adminHref,
  adminSectionOf,
  parseAdminRoute,
  parsePublicConsultationRoute,
  publicConsultationHref,
  settingsTabOf,
  settingsView,
  templatesSegmentOf,
} from "./routes";

describe("parseAdminRoute", () => {
  it("reads the municipality and the view of #/:slug/:view", () => {
    expect(parseAdminRoute("#/municipio-a/liquidaciones")).toEqual({
      slug: "municipio-a",
      view: "liquidaciones",
      isAlias: false,
    });
    expect(parseAdminRoute("#/municipio-b/configuracion/plantillas")).toEqual({
      slug: "municipio-b",
      view: "configuracion/plantillas",
      isAlias: false,
    });
    expect(
      parseAdminRoute("#/municipio-a/configuracion/consulta/?x=1"),
    ).toEqual({
      slug: "municipio-a",
      view: "configuracion/consulta",
      isAlias: false,
    });
  });

  it("takes the old Plantillas and Consulta pública addresses to their tab", () => {
    expect(parseAdminRoute("#/municipio-a/plantillas")).toEqual({
      slug: "municipio-a",
      view: "configuracion/plantillas",
      isAlias: true,
    });
    expect(parseAdminRoute("#/municipio-a/consulta-publica?x=1")).toEqual({
      slug: "municipio-a",
      view: "configuracion/consulta",
      isAlias: true,
    });
  });

  it("opens the first tab of Configuración when the address has none", () => {
    expect(parseAdminRoute("#/municipio-a/configuracion")).toEqual({
      slug: "municipio-a",
      view: "configuracion/plantillas",
      isAlias: true,
    });
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
      view: "configuracion/plantillas",
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
      "configuracion/plantillas",
      "configuracion/consulta",
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
    expect(adminHref("municipio-a", settingsView("consulta"))).toBe(
      "#/municipio-a/configuracion/consulta",
    );
  });
});

describe("adminSectionOf and settingsTabOf", () => {
  it("puts both tabs of Configuración under its single menu entry", () => {
    expect(adminSectionOf("configuracion/plantillas")).toBe("configuracion");
    expect(adminSectionOf("configuracion/consulta")).toBe("configuracion");
    expect(settingsTabOf("configuracion/consulta")).toBe("consulta");
  });

  it("keeps the templates of each document under Configuración, outside its tabs", () => {
    expect(adminSectionOf("configuracion/plantillas/mandamiento")).toBe(
      "configuracion",
    );
    expect(settingsTabOf("configuracion/plantillas/mandamiento")).toBeNull();
    expect(templatesSegmentOf("configuracion/plantillas/mandamiento")).toBe(
      "mandamiento",
    );
    expect(templatesSegmentOf("configuracion/plantillas")).toBeNull();
  });

  it("does not take an unknown document as a templates screen", () => {
    expect(
      parseAdminRoute("#/municipio-a/configuracion/plantillas/otra").view,
    ).toBe("cargas");
  });

  it("leaves the other views as their own entry, with no tab", () => {
    for (const view of ["cargas", "liquidaciones", "mandamientos"] as const) {
      expect(adminSectionOf(view)).toBe(view);
      expect(settingsTabOf(view)).toBeNull();
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
      "#/municipio-a/configuracion/consulta",
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
