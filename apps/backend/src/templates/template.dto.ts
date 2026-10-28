import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PdfDocumentType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

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

export class SelectionDto {
  @ApiProperty({ example: 'body:p12' })
  @IsString()
  @IsNotEmpty()
  blockId!: string;

  @ApiProperty({
    description:
      'Posición inicial (incluida) en el texto visible del párrafo, en unidades UTF-16.',
    example: 8,
  })
  @IsInt()
  @Min(0)
  start!: number;

  @ApiProperty({ description: 'Posición final (excluida).', example: 20 })
  @IsInt()
  @Min(0)
  end!: number;

  @ApiProperty({
    description: 'Marcador del catálogo (`key`); los de tabla con prefijo.',
    example: 'cadastralCode',
  })
  @IsString()
  @IsNotEmpty()
  field!: string;
}

export class PreviewDraftDto {
  @ApiProperty({
    type: [SelectionDto],
    description:
      'Todas las selecciones, completas en cada petición. Los marcadores que el documento ya traía no se reenvían.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectionDto)
  selections!: SelectionDto[];

  @ApiPropertyOptional({
    type: [String],
    description:
      'Filas de tabla que se quitan del documento, cada una nombrada por el blockId de uno de sus párrafos. Sirve para las filas con valores de ejemplo que trae la tabla además de su fila de ejemplo. No pueden tener marcadores ni ser todas las filas de una tabla.',
    example: ['body:p24'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removedRows?: string[];
}

export class SaveDraftDto extends PreviewDraftDto {
  @ApiPropertyOptional({
    description:
      'Obligatorio en true si el municipio ya tiene una plantilla activa de ese tipo.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  replaceConfirmed?: boolean;

  @ApiPropertyOptional({
    description:
      'Nombre con el que se guarda la versión (y se descarga). Sin él, queda el del archivo subido. Se le agrega .docx; hasta 120 caracteres, sin barras.',
    example: 'Liquidación oficial 2026',
  })
  @IsOptional()
  @IsString()
  fileName?: string;
}

export class DraftViewDto {
  @ApiProperty({ format: 'uuid' })
  draftId!: string;

  @ApiProperty({ enum: PdfDocumentType })
  documentType!: PdfDocumentType;

  @ApiProperty()
  fileName!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty({ description: '24 horas después de la subida.' })
  expiresAt!: Date;
}
