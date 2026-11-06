import { afterEach, describe, expect, it, vi } from "vitest";
import { loginConsultationHref } from "./municipality";

describe("loginConsultationHref", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds no link when no municipality is known", () => {
    vi.stubEnv("VITE_MUNICIPALITY_SLUG", undefined);
    expect(loginConsultationHref(null, null)).toBeNull();
    vi.stubEnv("VITE_MUNICIPALITY_SLUG", "");
    expect(loginConsultationHref(null, null)).toBeNull();
  });

  it("falls back to VITE_MUNICIPALITY_SLUG", () => {
    vi.stubEnv("VITE_MUNICIPALITY_SLUG", "municipio-a");
    expect(loginConsultationHref(null, null)).toBe("#/consulta/municipio-a");
  });

  it("prefers the URL's municipality, then the one this browser remembers", () => {
    vi.stubEnv("VITE_MUNICIPALITY_SLUG", "municipio-c");
    expect(loginConsultationHref("municipio-a", "municipio-b")).toBe(
      "#/consulta/municipio-a",
    );
    expect(loginConsultationHref(null, "municipio-b")).toBe(
      "#/consulta/municipio-b",
    );
  });
});
