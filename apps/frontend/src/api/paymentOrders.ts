import { request, requestBlob } from "./httpClient";
import type { BlobResponse } from "./httpClient";
import { municipalityPath } from "./municipality";
import type { TaxRollRowIssue } from "./taxRoll";

// Payment orders (mandamientos de pago) of the active municipality (SL-128,
// SL-129; rules in Confluence "Diseñar y validar con el cliente el flujo de
// generación de mandamientos SL-127"). A payment order covers every eligible
// period of one property and gets its own consecutive number.

// Why a period of the Excel can't get a payment order now.
export type PaymentOrderRejectionReason =
  | "SETTLEMENT_NOT_FOUND"
  | "SETTLEMENT_REPLACED"
  | "ALREADY_HAS_PAYMENT_ORDER"
  | "NO_RESOLUTION"
  | "STATUS_NOT_ELIGIBLE"
  | "NOT_YET_FIRM";

interface PaymentOrderImportRow {
  cadastralCode: string;
  period: number;
}

export interface EligiblePaymentOrderRow extends PaymentOrderImportRow {
  settlementId: number;
  resolutionNumber: string;
}

export interface IneligiblePaymentOrderRow extends PaymentOrderImportRow {
  // null when the file lists a property+period with no current liquidation.
  settlementId: number | null;
  reason: PaymentOrderRejectionReason;
  // Only for NOT_YET_FIRM: when the liquidation becomes "En firme".
  firmOn?: string;
}

// What POST /payment-orders/import answers. It saves nothing.
export interface PaymentOrderImportPreview {
  fileName: string;
  // Distinct property+period pairs in the file.
  rows: number;
  eligible: EligiblePaymentOrderRow[];
  ineligible: IneligiblePaymentOrderRow[];
  // Same row checks as the tax roll.
  invalidRows: TaxRollRowIssue[];
  warnings: TaxRollRowIssue[];
}

export interface IssuedPaymentOrder {
  paymentOrderId: number;
  // "2026-0001"; the PDF is "MP-2026-0001".
  number: string;
  issuedAt: string;
  propertyId: number;
  settlementIds: number[];
}

export interface GeneratePaymentOrdersResult {
  created: IssuedPaymentOrder[];
  rejected: {
    settlementId: number;
    reason: PaymentOrderRejectionReason;
    firmOn?: string;
  }[];
}

export interface PaymentOrderSummary {
  id: number;
  number: string;
  issuedAt: string;
  cadastralCode: string;
  settlementIds: number[];
  periods: number[];
}

// Same columns and row checks as the tax roll, including the municipality of
// the cadastral codes (TAX_ROLL_WRONG_MUNICIPALITY).
export function importPaymentOrders(
  file: File,
): Promise<PaymentOrderImportPreview> {
  const form = new FormData();
  form.append("file", file);
  return request(municipalityPath("/payment-orders/import"), {
    method: "POST",
    body: form,
  });
}

// Issues the payment orders right away, one per property; settlements that
// stopped qualifying come back in `rejected`. 409 while a bulk job runs.
export function generatePaymentOrders(
  settlementIds: number[],
): Promise<GeneratePaymentOrdersResult> {
  return request(municipalityPath("/payment-orders"), {
    method: "POST",
    body: { settlementIds },
  });
}

// The latest 100, newest first.
export function listPaymentOrders(
  signal?: AbortSignal,
): Promise<PaymentOrderSummary[]> {
  return request(municipalityPath("/payment-orders"), { signal });
}

// Renders an issued payment order again; it never takes a new number.
export function downloadPaymentOrderPdf(id: number): Promise<BlobResponse> {
  return requestBlob(municipalityPath(`/payment-orders/${id}/pdf`), {
    method: "POST",
  });
}
