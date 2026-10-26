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

export class TemplateCatalogQueryDto {
  @ApiProperty({ enum: PdfDocumentType })
  @IsEnum(PdfDocumentType)
  documentType!: PdfDocumentType;
}

export class CatalogEntryDto {
  @ApiProperty({
    description:
      'Nombre técnico del marcador; es el valor de `field` en las selecciones.',
    example: 'rows.year',
  })
  key!: string;

  @ApiProperty({ example: 'Vigencia (año)' })
  label!: string;

  @ApiProperty({ example: 'Año de la vigencia de esa fila. Ej.: 2024.' })
  description!: string;

  @ApiProperty()
  required!: boolean;

  @ApiProperty({ enum: ['SCALAR', 'TABLE_ROW', 'INLINE_LIST'] })
  kind!: 'SCALAR' | 'TABLE_ROW' | 'INLINE_LIST';
}

export class ListTemplatesQueryDto {
  @ApiPropertyOptional({ enum: PdfDocumentType })
  @IsOptional()
  @IsEnum(PdfDocumentType)
  documentType?: PdfDocumentType;
}
