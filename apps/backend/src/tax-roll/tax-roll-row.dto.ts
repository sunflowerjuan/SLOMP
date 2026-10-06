import type { RowIssueCode } from '../common/errors/error-codes.js';

export interface TaxRollRowDto {
  cadastralCode: string;
  landUse: string;
  appraisalValue: number;
  ruralDistrict: string | null;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  taxId: string;
  ownerName: string | null;
  propertyName: string;
  period: number;
  propertyTax: number;
  propertyTaxInterest: number;
  environmentalFee: number;
  environmentalFeeInterest: number;
  fireSurcharge: number;
  fireSurchargeInterest: number;
  total: number;
}

export interface TaxRollRowIssue {
  row: number;
  // Stable identifier the frontend maps to the text shown to the user.
  code: RowIssueCode;
  // Developer-facing English description of the same problem.
  reason: string;
  details?: Record<string, unknown>;
}

export interface ParseTaxRollExcelResult {
  validRows: TaxRollRowDto[];
  invalidRows: TaxRollRowIssue[];
  warnings: TaxRollRowIssue[];
}
