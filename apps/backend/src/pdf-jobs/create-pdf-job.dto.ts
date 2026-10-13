import { PdfDocumentType, ResolutionKind } from '@prisma/client';
import { IsEnum, IsIn } from 'class-validator';

// Only liquidations for now; payment orders arrive with SL-129.
const SUPPORTED_DOCUMENT_TYPES = [PdfDocumentType.LIQUIDACION];

export class CreatePdfJobDto {
  @IsIn(SUPPORTED_DOCUMENT_TYPES)
  documentType!: PdfDocumentType;

  @IsEnum(ResolutionKind)
  kind!: ResolutionKind;
}

export class PendingPdfJobsQueryDto {
  @IsIn(SUPPORTED_DOCUMENT_TYPES)
  documentType!: PdfDocumentType;
}
