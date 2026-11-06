import type { RowIssueCode } from '../common/errors/error-codes.js';
import type { LandUse } from './land-use.js';
import type { DocumentTypeCode } from './parse-owner-document.js';

export interface TaxRollRowDto {
  cadastralCode: string;
  landUse: LandUse | null;
  appraisalValue: number;
  ruralDistrict: string | null;
  neighborhood: string | null;
  latitude: number | null;
  longitude: number | null;
  // The document number, without the classification label if the CCNIT
  // cell had one ("CC 40587912" -> "40587912").
  taxId: string;
  // Only what the CCNIT cell states explicitly; null when it states nothing.
  // Never deduced from the number (SL-75, rule confirmed with the client).
  documentType: DocumentTypeCode | null;
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
