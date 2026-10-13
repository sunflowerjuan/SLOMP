import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PdfDocumentType } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class UploadTemplateDto {
  @ApiProperty({
    enum: PdfDocumentType,
    description:
      'Tipo de documento de la plantilla. Por ahora solo LIQUIDACION tiene catálogo de campos.',
  })
  @IsEnum(PdfDocumentType)
  documentType!: PdfDocumentType;
}

export class ListTemplatesQueryDto {
  @ApiPropertyOptional({ enum: PdfDocumentType })
  @IsOptional()
  @IsEnum(PdfDocumentType)
  documentType?: PdfDocumentType;
}
