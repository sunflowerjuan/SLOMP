export interface TaxRollRowDto {
  cadastralCode: string;
  landUse: string;
  appraisalValue: number;
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
  reason: string;
}

export interface ParseTaxRollExcelResult {
  validRows: TaxRollRowDto[];
  invalidRows: TaxRollRowIssue[];
  warnings: TaxRollRowIssue[];
}
