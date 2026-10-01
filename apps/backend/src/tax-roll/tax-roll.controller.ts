import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { TaxRollService } from './tax-roll.service.js';

@ApiTags('tax-roll')
@ApiBearerAuth()
@Controller('tax-roll')
export class TaxRollController {
  constructor(private readonly taxRollService: TaxRollService) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary:
      'Importa el Excel de predios y deudas del periodo, y persiste las liquidaciones resultantes.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'Archivo Excel (.xlsx) con el reporte de predios y deudas.',
        },
        confirmReplace: {
          type: 'string',
          enum: ['true', 'false'],
          description:
            'Confirma el reemplazo de una liquidación ACTIVA ya existente para el mismo predio y periodo (HU18). Si se omite o es "false" y hay conflictos, esos pares predio/periodo quedan reportados en "persisted.conflicts" sin modificarse.',
        },
        previousImportId: {
          type: 'string',
          description:
            'Id del TaxRollImport que se está confirmando (HU18). Si se envía y corresponde al mismo archivo y administrador, esta carga actualiza ese registro de historial en vez de crear uno nuevo.',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'Excel leído y procesado. Puede incluir filas inválidas (no se persisten, van en "invalidRows") y conflictos de reemplazo no confirmados (van en "persisted.conflicts").',
    schema: {
      example: {
        validRows: [
          {
            cadastralCode: '041-01-0023-000',
            landUse: 'Residencial',
            appraisalValue: 85000000,
            taxId: '900123456',
            ownerName: 'María Fernanda Ríos',
            propertyName: 'Calle 45 # 12-30',
            period: 2024,
            propertyTax: 340000,
            propertyTaxInterest: 0,
            environmentalFee: 12000,
            environmentalFeeInterest: 0,
            fireSurcharge: 5000,
            fireSurchargeInterest: 0,
            total: 357000,
          },
        ],
        invalidRows: [{ row: 8, reason: 'Missing cadastral code' }],
        warnings: [{ row: 12, reason: 'Missing owner' }],
        persisted: {
          properties: 1,
          owners: 1,
          settlements: 1,
          conflicts: [{ cadastralCode: '041-02-0011-010', period: 2024 }],
        },
        importId: 17,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'No se adjuntó ningún archivo en el campo "file", el archivo no tiene extensión .xlsx, o el contenido del Excel no se pudo leer (hoja vacía, encabezados distintos a los esperados, etc.).',
  })
  import(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
    // Multipart form fields always arrive as strings.
    @Body('confirmReplace') confirmReplace?: string,
    // Id del TaxRollImport que se esta confirmando (HU18) -- ver
    // TaxRollService.import.
    @Body('previousImportId') previousImportId?: string,
  ) {
    if (!file) {
      throw new BadRequestException(
        'You must attach an Excel file (.xlsx) in the "file" field.',
      );
    }
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('The file must have a .xlsx extension.');
    }
    const parsedPreviousImportId = Number(previousImportId);
    return this.taxRollService.import(
      file.buffer,
      confirmReplace === 'true',
      file.originalname,
      user.id,
      previousImportId && Number.isInteger(parsedPreviousImportId)
        ? parsedPreviousImportId
        : undefined,
    );
  }

  @Get('imports')
  @ApiOperation({
    summary:
      'Lista el historial de cargas de Excel, más reciente primero (máximo 50, sin paginación).',
  })
  @ApiResponse({
    status: 200,
    description: 'Historial de cargas.',
    schema: {
      example: [
        {
          id: 17,
          fileName: 'periodo_2024_Q1.xlsx',
          importedAt: '2024-03-14T15:32:00.000Z',
          validRows: 812,
          invalidRows: 3,
          warnings: 1,
          properties: 812,
          owners: 790,
          settlements: 812,
          conflicts: 0,
          administratorEmail: 'admin@paez-boyaca.gov.co',
        },
      ],
    },
  })
  listImports() {
    return this.taxRollService.listImports();
  }
}
