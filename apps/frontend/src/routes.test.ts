import { describe, expect, it } from "vitest";
import {
  adminHref,
  adminSectionOf,
  parseAdminRoute,
  parsePublicConsultationRoute,
  publicConsultationHref,
  settingsTabOf,
  settingsView,
} from "./routes";

describe("parseAdminRoute", () => {
  it("reads the municipality and the view of #/:slug/:view", () => {
    expect(parseAdminRoute("#/paez/liquidaciones")).toEqual({
      slug: "paez",
      view: "liquidaciones",
      isAlias: false,
    });
    expect(parseAdminRoute("#/paez-cauca/configuracion/plantillas")).toEqual({
      slug: "paez-cauca",
      view: "configuracion/plantillas",
      isAlias: false,
    });
    expect(parseAdminRoute("#/paez/configuracion/consulta/?x=1")).toEqual({
      slug: "paez",
      view: "configuracion/consulta",
      isAlias: false,
    });
  });

  it("takes the old Plantillas and Consulta pública addresses to their tab", () => {
    expect(parseAdminRoute("#/paez/plantillas")).toEqual({
      slug: "paez",
      view: "configuracion/plantillas",
      isAlias: true,
    });
    expect(parseAdminRoute("#/paez/consulta-publica?x=1")).toEqual({
      slug: "paez",
      view: "configuracion/consulta",
      isAlias: true,
    });
  });

  it("opens the first tab of Configuración when the address has none", () => {
    expect(parseAdminRoute("#/paez/configuracion")).toEqual({
      slug: "paez",
      view: "configuracion/plantillas",
      isAlias: true,
    });
  });

  it("opens Cartera when the view is missing or unknown", () => {
    for (const hash of [
      "#/paez",
      "#/paez/",
      "#/paez/otra",
      "#/paez/configuracion/otra",
      "#/paez/liquidaciones/otra",
    ]) {
      expect(parseAdminRoute(hash)).toEqual({
        slug: "paez",
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
    expect(parseAdminRoute("#/Paez/cargas").slug).toBe("Paez");
    expect(parseAdminRoute("#/%E0%A4%A/cargas").slug).toBe("%E0%A4%A");
  });

  it("round-trips every view through adminHref", () => {
    for (const view of [
      "cargas",
      "liquidaciones",
      "mandamientos",
      "configuracion/plantillas",
      "configuracion/consulta",
    ] as const) {
      expect(parseAdminRoute(adminHref("paez-cauca", view))).toEqual({
        slug: "paez-cauca",
        view,
        isAlias: false,
      });
    }
    expect(adminHref("paez")).toBe("#/paez/cargas");
    expect(adminHref("paez", settingsView("consulta"))).toBe(
      "#/paez/configuracion/consulta",
    );
  });
});

describe("adminSectionOf and settingsTabOf", () => {
  it("puts both tabs of Configuración under its single menu entry", () => {
    expect(adminSectionOf("configuracion/plantillas")).toBe("configuracion");
    expect(adminSectionOf("configuracion/consulta")).toBe("configuracion");
    expect(settingsTabOf("configuracion/consulta")).toBe("consulta");
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
      "#/paez/configuracion/consulta",
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
