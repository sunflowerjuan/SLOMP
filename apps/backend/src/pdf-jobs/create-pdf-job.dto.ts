import { PdfDocumentType, ResolutionKind } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsPositive,
  ValidateIf,
} from 'class-validator';

// The most settlements one payment orders job can list; keeps the body well
// under the request size limit.
export const MAX_PAYMENT_ORDER_JOB_SETTLEMENTS = 10_000;

export class CreatePdfJobDto {
  @IsEnum(PdfDocumentType)
  documentType!: PdfDocumentType;

  // Liquidations only: which ZIP (prescription risk or normal collection).
  @ValidateIf((job: CreatePdfJobDto) => job.documentType === 'LIQUIDACION')
  @IsEnum(ResolutionKind)
  kind!: ResolutionKind;

  // Payment orders only: the "eligible" settlements of the Excel preview.
  @ValidateIf((job: CreatePdfJobDto) => job.documentType === 'MANDAMIENTO')
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_PAYMENT_ORDER_JOB_SETTLEMENTS)
  @ArrayUnique()
  @IsInt({ each: true })
  @IsPositive({ each: true })
  settlementIds!: number[];
}

// The input of a payment orders job is the Excel, not the database, so only
// liquidations have a "pending" count.
export class PendingPdfJobsQueryDto {
  @IsIn([PdfDocumentType.LIQUIDACION])
  documentType!: PdfDocumentType;
}
