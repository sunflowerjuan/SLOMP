import { describe, expect, it } from "vitest";
import {
  messageForErrorCode,
  missingLiquidationDataText,
} from "./errorMessages";

describe("LIQUIDATION_DATA_INCOMPLETE", () => {
  it("names the missing data of a single liquidation", () => {
    expect(
      messageForErrorCode("LIQUIDATION_DATA_INCOMPLETE", {
        missing: ["PROPERTY_ADDRESS"],
      }),
    ).toBe(
      "No se puede generar el PDF porque a la liquidación le falta la dirección del predio. Completa esos datos e intenta de nuevo.",
    );
  });

  it("counts the incomplete liquidations of a bulk ZIP", () => {
    const document = {
      cadastralCode: "155140001000000010001",
      periods: [2020],
      missing: ["PROPERTY_ADDRESS"],
    };
    expect(
      messageForErrorCode("LIQUIDATION_DATA_INCOMPLETE", {
        documents: [document, document, document],
      }),
    ).toBe(
      "No se puede generar el ZIP porque 3 liquidaciones tienen datos incompletos. Complétalas e intenta de nuevo.",
    );
    expect(
      messageForErrorCode("LIQUIDATION_DATA_INCOMPLETE", {
        documents: [document],
      }),
    ).toBe(
      "No se puede generar el ZIP porque una liquidación tiene datos incompletos. Complétala e intenta de nuevo.",
    );
  });
});

describe("missingLiquidationDataText", () => {
  it("lists what one liquidation of the bulk ZIP lacks", () => {
    expect(missingLiquidationDataText(["PROPERTY_ADDRESS"])).toBe(
      "Falta la dirección del predio.",
    );
    expect(
      missingLiquidationDataText(["CADASTRAL_CODE", "SETTLEMENT_DETAILS"]),
    ).toBe("Faltan la cédula catastral y el detalle de conceptos.");
    expect(missingLiquidationDataText([])).toBe("Faltan datos.");
  });
});

describe("bulk job codes (SL-120)", () => {
  it("has a text for every new code", () => {
    for (const code of [
      "BULK_JOB_EXPIRED",
      "BULK_JOB_STALLED",
      "BULK_ZIP_INCOMPLETE",
      "TEMPLATE_RENDER_FAILED",
      "PDF_STORAGE_UNAVAILABLE",
      "PDF_SERVICE_NOT_CONFIGURED",
    ]) {
      expect(messageForErrorCode(code)).toMatch(/\.$/);
    }
  });

  it("sends the taxpayer to the municipality for PDF service problems", () => {
    for (const code of [
      "TEMPLATE_RENDER_FAILED",
      "PDF_STORAGE_UNAVAILABLE",
      "PDF_SERVICE_NOT_CONFIGURED",
    ]) {
      expect(messageForErrorCode(code, {}, "public")).toContain(
        "Secretaría de Hacienda",
      );
    }
  });
});
