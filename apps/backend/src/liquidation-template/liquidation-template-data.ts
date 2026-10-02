export interface LiquidationTemplateData {
  /** `<year>-<4-digit sequence>`, e.g. "2026-0042". The template prints "RESOLUCION N° LOIP 15514" right before it. */
  resolutionNumber: string;
  cadastralCode: string;
  propertyName: string;
  owners: string;
  startYear: string;
  endYear: string;
  totalAmount: string;
  capitalAmount: string;
  interestAmount: string;
  rows: Array<{
    year: string;
    concept: string;
    interest: string;
    capital: string;
  }>;
}
