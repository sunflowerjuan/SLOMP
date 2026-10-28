import { describe, expect, it } from "vitest";
import {
  messageForErrorCode,
  messageForPaymentOrderRejection,
  missingLiquidationDataText,
  paymentOrderLeftOutMessage,
} from "./errorMessages";

describe("messageForPaymentOrderRejection", () => {
  it("says when a liquidation that isn't firm yet will be", () => {
    expect(
      messageForPaymentOrderRejection(
        "NOT_YET_FIRM",
        "2026-12-20T15:00:00.000Z",
      ),
    ).toBe("Queda en firme el 20 de diciembre de 2026.");
    expect(messageForPaymentOrderRejection("NOT_YET_FIRM")).toBe(
      "Todavía no está en firme.",
    );
  });

  it("names the periods a payment order was issued without", () => {
    expect(paymentOrderLeftOutMessage("2026-0004", [2019])).toBe(
      "El mandamiento 2026-0004 se generó sin el periodo 2019, que ya no cumplía las condiciones.",
    );
    expect(paymentOrderLeftOutMessage("2026-0004", [2019, 2020, 2022])).toBe(
      "El mandamiento 2026-0004 se generó sin los periodos 2019–2020, 2022, que ya no cumplían las condiciones.",
    );
  });

  it("has a text for every reason the backend sends", () => {
    for (const reason of [
      "SETTLEMENT_NOT_FOUND",
      "SETTLEMENT_REPLACED",
      "ALREADY_HAS_PAYMENT_ORDER",
      "NO_RESOLUTION",
      "STATUS_NOT_ELIGIBLE",
    ]) {
      expect(messageForPaymentOrderRejection(reason)).not.toBe(
        messageForPaymentOrderRejection("SOMETHING_NEW"),
      );
    }
  });
});

describe("payment order wording", () => {
  it("talks about the payment order template, not the liquidation's", () => {
    expect(
      messageForErrorCode(
        "PDF_TEMPLATE_UNAVAILABLE",
        {},
        "admin",
        "MANDAMIENTO",
      ),
    ).toBe(
      "Este municipio no tiene una plantilla de mandamiento activa. Súbela en Plantillas e intenta de nuevo.",
    );
    expect(messageForErrorCode("PDF_TEMPLATE_UNAVAILABLE")).toContain(
      "plantilla de liquidación",
    );
  });

  it("counts payment orders with incomplete data in a bulk ZIP", () => {
    const document = {
      cadastralCode: "155140001000000010001",
      periods: [2020, 2021],
      missing: ["PROPERTY_ADDRESS"],
    };
    expect(
      messageForErrorCode(
        "LIQUIDATION_DATA_INCOMPLETE",
        { documents: [document, document] },
        "admin",
        "MANDAMIENTO",
      ),
    ).toBe(
      "No se puede generar el ZIP porque 2 mandamientos tienen datos incompletos. Completa sus liquidaciones e intenta de nuevo.",
    );
  });

  it("keeps the shared text for codes that don't name the document", () => {
    expect(
      messageForErrorCode("BULK_JOB_EXPIRED", {}, "admin", "MANDAMIENTO"),
    ).toBe(messageForErrorCode("BULK_JOB_EXPIRED"));
  });
});

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
