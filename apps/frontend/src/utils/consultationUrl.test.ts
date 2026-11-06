import { describe, expect, it } from "vitest";
import { consultationUrl } from "./consultationUrl";

describe("consultationUrl", () => {
  it("points at the municipality's own consultation", () => {
    expect(
      consultationUrl("https://consulta.example.gov.co/", "municipio-a"),
    ).toBe("https://consulta.example.gov.co/#/consulta/municipio-a");
  });

  it("differs per municipality only in the slug", () => {
    const app = "https://consulta.example.gov.co/";
    expect(consultationUrl(app, "municipio-a")).not.toBe(
      consultationUrl(app, "municipio-b"),
    );
  });
});
