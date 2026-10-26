import type { PdfDocumentType } from '@prisma/client';

export type FieldKind = 'SCALAR' | 'TABLE_ROW' | 'INLINE_LIST';

export interface FieldMeta {
  /** Name the lawyer sees. */
  label: string;
  /** One short sentence with an example. */
  description: string;
  kind: FieldKind;
  /** Required once the table is used (`rows.year`); `required` stays the upload rule. */
  requiredInTable?: true;
}

export interface FieldCatalog {
  /** Plain `{field}` markers. */
  scalars: readonly string[];
  /** `{#loop}...{/loop}` markers and the fields that only exist inside them. */
  loops: Record<string, readonly string[]>;
  /** Fields the template must use; the rest are optional. */
  required: readonly string[];
  /** Published fields by key (`loop` or `loop.field`); inline-list loops publish only the loop. */
  meta: Record<string, FieldMeta>;
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
  meta: {
    resolutionNumber: {
      label: 'Número de resolución',
      description:
        'Número con el que se identifica la resolución. Ej.: RES-0001-2026.',
      kind: 'SCALAR',
    },
    cadastralCode: {
      label: 'Código catastral del predio',
      description:
        'Código que identifica el predio en el catastro. Ej.: 00-01-0001-0001-000.',
      kind: 'SCALAR',
    },
    propertyName: {
      label: 'Nombre del predio',
      description: 'Nombre o dirección del predio. Ej.: Lote El Ejemplo.',
      kind: 'SCALAR',
    },
    owners: {
      label: 'Propietarios (nombres separados por coma)',
      description:
        'Nombres de los propietarios separados por coma. Ej.: María Pérez Gómez, Juan Rodríguez.',
      kind: 'SCALAR',
    },
    startYear: {
      label: 'Año inicial del cobro',
      description: 'Primer año que se cobra. Ej.: 2023.',
      kind: 'SCALAR',
    },
    endYear: {
      label: 'Año final del cobro',
      description: 'Último año que se cobra. Ej.: 2025.',
      kind: 'SCALAR',
    },
    totalAmount: {
      label: 'Valor total a pagar',
      description:
        'Suma de capital e intereses que debe pagar el contribuyente. Ej.: $1.250.000.',
      kind: 'SCALAR',
    },
    capitalAmount: {
      label: 'Valor total del capital',
      description: 'Suma del capital de todas las vigencias. Ej.: $1.000.000.',
      kind: 'SCALAR',
    },
    interestAmount: {
      label: 'Valor total de los intereses',
      description:
        'Suma de los intereses de todas las vigencias. Ej.: $250.000.',
      kind: 'SCALAR',
    },
    rows: {
      label: 'Tabla de vigencias (una fila por año)',
      description:
        'Fila de la tabla que el sistema repite una vez por año cobrado. Ej.: una fila para 2023, otra para 2024.',
      kind: 'TABLE_ROW',
    },
    'rows.year': {
      label: 'Vigencia (año)',
      description: 'Año de la vigencia de esa fila. Ej.: 2024.',
      kind: 'TABLE_ROW',
      requiredInTable: true,
    },
    'rows.concept': {
      label: 'Concepto',
      description: 'Concepto que se cobra en esa fila. Ej.: Impuesto predial.',
      kind: 'TABLE_ROW',
    },
    'rows.interest': {
      label: 'Intereses de la vigencia',
      description: 'Intereses de esa vigencia. Ej.: $80.000.',
      kind: 'TABLE_ROW',
    },
    'rows.capital': {
      label: 'Capital de la vigencia',
      description: 'Capital de esa vigencia. Ej.: $350.000.',
      kind: 'TABLE_ROW',
    },
  },
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
  meta: {
    paymentOrderNumber: {
      label: 'Número del mandamiento',
      description:
        'Número con el que se identifica el mandamiento. Ej.: MND-0001-2026.',
      kind: 'SCALAR',
    },
    issueDate: {
      label: 'Fecha de expedición (dd/mm/aaaa)',
      description: 'Fecha en que se expide el mandamiento. Ej.: 15/01/2026.',
      kind: 'SCALAR',
    },
    cadastralCode: {
      label: 'Código catastral del predio',
      description:
        'Código que identifica el predio en el catastro. Ej.: 00-01-0001-0001-000.',
      kind: 'SCALAR',
    },
    propertyName: {
      label: 'Nombre del predio',
      description: 'Nombre o dirección del predio. Ej.: Lote El Ejemplo.',
      kind: 'SCALAR',
    },
    owners: {
      label: 'Propietarios (nombres separados por coma)',
      description:
        'Nombres de los propietarios separados por coma. Ej.: María Pérez Gómez, Juan Rodríguez.',
      kind: 'SCALAR',
    },
    startYear: {
      label: 'Año inicial del cobro',
      description: 'Primer año que se cobra. Ej.: 2023.',
      kind: 'SCALAR',
    },
    endYear: {
      label: 'Año final del cobro',
      description: 'Último año que se cobra. Ej.: 2025.',
      kind: 'SCALAR',
    },
    capitalAmount: {
      label: 'Valor del capital',
      description:
        'Valor del capital que se cobra en el mandamiento. Ej.: $1.000.000.',
      kind: 'SCALAR',
    },
    liquidations: {
      label:
        'Liquidaciones que respalda el mandamiento (lista dentro del texto)',
      description:
        'Números de las liquidaciones que respalda el mandamiento, escritos dentro de una frase. Ej.: LIQ-0001-2026, LIQ-0002-2026.',
      kind: 'INLINE_LIST',
    },
  },
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
