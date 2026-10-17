import type { PdfDocumentType } from '@prisma/client';

export interface FieldCatalog {
  /** Plain `{field}` markers. */
  scalars: readonly string[];
  /** `{#loop}...{/loop}` markers and the fields that only exist inside them. */
  loops: Record<string, readonly string[]>;
  /** Fields the template must use; the rest are optional. */
  required: readonly string[];
}

// Mirrors LiquidationTemplateData (liquidation-template-data.ts). Only the
// fields every liquidation needs are required: a municipality may leave out
// a total it does not print.
export const LIQUIDATION_FIELDS: FieldCatalog = {
  scalars: [
    'resolutionNumber',
    'cadastralCode',
    'propertyName',
    'owners',
    'startYear',
    'endYear',
    'totalAmount',
    'capitalAmount',
    'interestAmount',
  ],
  loops: { rows: ['year', 'concept', 'interest', 'capital'] },
  required: ['resolutionNumber', 'cadastralCode', 'totalAmount', 'rows'],
};

// Mirrors PaymentOrderTemplateData (payment-orders/payment-order-template-data.ts).
// The payment order charges capital only, so there is no interest or table.
export const PAYMENT_ORDER_FIELDS: FieldCatalog = {
  scalars: [
    'paymentOrderNumber',
    'issueDate',
    'cadastralCode',
    'propertyName',
    'owners',
    'startYear',
    'endYear',
    'capitalAmount',
  ],
  loops: { liquidations: ['number', 'separator'] },
  required: [
    'paymentOrderNumber',
    'cadastralCode',
    'capitalAmount',
    'liquidations',
  ],
};

export interface FieldValidation {
  /** Required fields the template does not use. */
  missing: string[];
  /** Markers the template uses that no document can fill. */
  unknown: string[];
}

export const CATALOGS: Partial<Record<PdfDocumentType, FieldCatalog>> = {
  LIQUIDACION: LIQUIDATION_FIELDS,
  MANDAMIENTO: PAYMENT_ORDER_FIELDS,
};

export function validateTemplateFields(
  type: PdfDocumentType,
  detected: readonly string[],
): FieldValidation {
  const catalog = CATALOGS[type];
  if (!catalog) {
    throw new Error(`There is no field catalog for ${type} templates yet.`);
  }
  const allowed = new Set<string>([
    ...catalog.scalars,
    ...Object.entries(catalog.loops).flatMap(([loop, fields]) => [
      loop,
      ...fields.map((field) => `${loop}.${field}`),
    ]),
  ]);
  const found = new Set(detected);
  return {
    missing: catalog.required.filter((field) => !found.has(field)),
    unknown: detected.filter((field) => !allowed.has(field)),
  };
}
