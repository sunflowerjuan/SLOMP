export interface PaymentOrderTemplateData {
  /** `<year>-<4-digit sequence>`, e.g. "2026-0042". The template prints its own prefix ("RESOLUCION N° MP" and the municipality's DANE code) right before it. */
  paymentOrderNumber: string;
  /** dd/mm/yyyy, Colombia time. */
  issueDate: string;
  cadastralCode: string;
  propertyName: string;
  owners: string;
  startYear: string;
  endYear: string;
  /** Capital of every period it covers; interest is settled when it is paid. */
  capitalAmount: string;
  /** Official liquidations it refers to; `separator` joins them in prose. */
  liquidations: Array<{ number: string; separator: string }>;
}
