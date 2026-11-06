import { describe, expect, it } from "vitest";
import type { RejectedStatusChange } from "./assistant";
import {
  messageForErrorCode,
  messageForPaymentOrderRejection,
  missingLiquidationDataText,
  paymentOrderLeftOutMessage,
  statusChangeRejectionMessage,
  statusChangeRejectionTitle,
} from "./errorMessages";

describe("the rejections of a Slompsim proposal", () => {
  const rejected: RejectedStatusChange = {
    settlementId: 7,
    to: "PRESCRITA",
    reason: "TRANSITION_NOT_ALLOWED",
    allowed: ["EN_FIRME", "PAGADA"],
    cadastralCode: "010000040021000",
    period: 2019,
    current: "EN_FIRME",
  };

  it("names the period and the state it can't go to", () => {
    expect(statusChangeRejectionTitle(rejected)).toBe(
      "No se puede pasar la liquidación 2019 a Pérdida temporal de competencia",
    );
    expect(statusChangeRejectionTitle({ ...rejected, period: undefined })).toBe(
      "No se puede aplicar este cambio",
    );
  });

  it("explains each reason without codes", () => {
    const paymentOrder = {
      number: "2026-0004",
      issuedAt: "2026-10-20T15:00:00.000Z",
    };
    const texts: [Partial<RejectedStatusChange>, string][] = [
      [
        { paymentOrder },
        "Este periodo está en el mandamiento 2026-0004 del 20/10/2026. Un periodo con mandamiento solo puede pasar a ese estado cuando se cumplan 5 años desde el mandamiento, es decir, desde el 20/10/2031.",
      ],
      [{ to: "VIGENTE" }, "Una liquidación en firme no vuelve a Vigente."],
      [
        { to: "EN_FIRME", current: "VIGENTE" },
        "Ese cambio de estado no está permitido para esta liquidación.",
      ],
      [
        { reason: "REPLACED" },
        "La liquidación 2019 del predio 010000040021000 fue reemplazada por una carga más reciente. Pide el cambio de nuevo.",
      ],
      [{ reason: "NOT_FOUND" }, "No encontré esa liquidación en Ejemplo."],
    ];
    for (const [overrides, text] of texts) {
      expect(
        statusChangeRejectionMessage({ ...rejected, ...overrides }, "Ejemplo"),
      ).toBe(text);
    }
  });

  it("counts what changed while the Administrator was reviewing", () => {
    expect(
      messageForErrorCode("ASSISTANT_CHANGES_REJECTED", {
        rejected: [{}, {}, {}],
      }),
    ).toBe(
      "No se aplicó ningún cambio: 3 liquidaciones cambiaron mientras revisabas. Revisa la propuesta de nuevo.",
    );
    expect(
      messageForErrorCode("ASSISTANT_CHANGES_REJECTED", { rejected: [{}] }),
    ).toContain("1 liquidación cambió");
  });

  it("has a text for every code of the assistant", () => {
    for (const code of [
      "ASSISTANT_UNAVAILABLE",
      "ASSISTANT_RATE_LIMITED",
      "ASSISTANT_TOO_MANY_TOOL_CALLS",
      "ASSISTANT_TOOL_INPUT_INVALID",
    ]) {
      expect(messageForErrorCode(code)).not.toBeNull();
    }
  });
});

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
