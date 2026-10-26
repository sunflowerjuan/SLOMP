import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { errorBody } from '../common/errors/error-body.js';
import { ErrorCode } from '../common/errors/error-codes.js';
import { CurrentMunicipality } from '../municipalities/current-municipality.decorator.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { MunicipalityGuard } from '../municipalities/municipality.guard.js';
import {
  CatalogEntryDto,
  ListTemplatesQueryDto,
  TemplateCatalogQueryDto,
  UploadTemplateDto,
} from './template.dto.js';
import { buildTemplateCatalog } from './template-catalog.js';
import {
  MAX_TEMPLATE_FILE_SIZE_MB,
  TEMPLATE_UPLOAD_LIMITS,
  TemplateFileTooLargeFilter,
} from './template-upload.js';
import { TemplatesService } from './templates.service.js';

@ApiTags('templates')
@ApiBearerAuth()
@UseGuards(MunicipalityGuard)
@Controller('municipalities/:slug/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: TEMPLATE_UPLOAD_LIMITS }))
  @UseFilters(TemplateFileTooLargeFilter)
  @ApiOperation({
    summary:
      'Sube una plantilla .docx. Si es válida queda como la versión activa del municipio; si no, se rechaza indicando qué marcador falla.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: `Plantilla Word (.docx) con marcadores {campo}. Tamaño máximo: ${MAX_TEMPLATE_FILE_SIZE_MB} MB.`,
        },
        documentType: { type: 'string', enum: ['LIQUIDACION', 'MANDAMIENTO'] },
      },
      required: ['file', 'documentType'],
    },
  })
  upload(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UploadTemplateDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.TEMPLATE_FILE_MISSING,
          'You must attach a Word file (.docx) in the "file" field.',
        ),
      );
    }
    if (!file.originalname.toLowerCase().endsWith('.docx')) {
      throw new BadRequestException(
        errorBody(
          ErrorCode.TEMPLATE_FILE_EXTENSION,
          'The file must have a .docx extension.',
        ),
      );
    }
    return this.templates.upload(
      municipality,
      body.documentType,
      { buffer: file.buffer, originalname: file.originalname },
      user.id,
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'Lista las versiones de plantillas del municipio (la activa lleva isActive), la más reciente primero.',
  })
  list(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Query() query: ListTemplatesQueryDto,
  ) {
    return this.templates.list(municipality.id, query.documentType);
  }

  @Get('catalog')
  @ApiOperation({
    summary:
      'Marcadores disponibles para un tipo de documento, con nombre en español, descripción, clase y si son obligatorios (los obligatorios primero).',
  })
  @ApiOkResponse({ type: [CatalogEntryDto] })
  catalog(@Query() query: TemplateCatalogQueryDto) {
    return buildTemplateCatalog(query.documentType);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Vuelve a activar una versión anterior (rollback).',
  })
  activate(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.templates.activate(municipality.id, id);
  }
}
