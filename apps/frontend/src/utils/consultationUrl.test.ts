import { describe, expect, it } from "vitest";
import { consultationUrl } from "./consultationUrl";

describe("consultationUrl", () => {
  it("points at the municipality's own consultation", () => {
    expect(consultationUrl("https://consulta.example.gov.co/", "paez")).toBe(
      "https://consulta.example.gov.co/#/consulta/paez",
    );
  });

  it("differs per municipality only in the slug", () => {
    const app = "https://consulta.example.gov.co/";
    expect(consultationUrl(app, "paez")).not.toBe(
      consultationUrl(app, "paez-cauca"),
    );
  });
});
