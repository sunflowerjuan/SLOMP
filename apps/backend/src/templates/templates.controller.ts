import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiProduces,
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
  DraftViewDto,
  ListTemplatesQueryDto,
  PreviewDraftDto,
  SaveDraftDto,
  TemplateCatalogQueryDto,
  UploadTemplateDto,
} from './template.dto.js';
import { buildTemplateCatalog } from './template-catalog.js';
import {
  MAX_TEMPLATE_FILE_SIZE_MB,
  TEMPLATE_UPLOAD_OPTIONS,
  TemplateFileTooLargeFilter,
} from './template-upload.js';
import { DOCX_TYPE, TemplatesService } from './templates.service.js';

// The checks multer cannot do; the size limit is TEMPLATE_UPLOAD_LIMITS.
function requireDocx(file?: Express.Multer.File): Express.Multer.File {
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
  return file;
}

function uploadBody(fileDescription: string) {
  return ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: `${fileDescription} Tamaño máximo: ${MAX_TEMPLATE_FILE_SIZE_MB} MB.`,
        },
        documentType: { type: 'string', enum: ['LIQUIDACION', 'MANDAMIENTO'] },
      },
      required: ['file', 'documentType'],
    },
  });
}

@ApiTags('templates')
@ApiBearerAuth()
@UseGuards(MunicipalityGuard)
@Controller('municipalities/:slug/templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', TEMPLATE_UPLOAD_OPTIONS))
  @UseFilters(TemplateFileTooLargeFilter)
  @ApiOperation({
    summary:
      'Sube una plantilla .docx. Si es válida queda como la versión activa del municipio; si no, se rechaza indicando qué marcador falla.',
  })
  @ApiConsumes('multipart/form-data')
  @uploadBody('Plantilla Word (.docx) con marcadores {campo}.')
  upload(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UploadTemplateDto,
    @UploadedFile() upload?: Express.Multer.File,
  ) {
    const file = requireDocx(upload);
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

  @Post('drafts')
  @UseInterceptors(FileInterceptor('file', TEMPLATE_UPLOAD_OPTIONS))
  @UseFilters(TemplateFileTooLargeFilter)
  @ApiOperation({
    summary:
      'Marcado guiado, paso 1: sube un .docx sin marcar como borrador (no se activa). Vence a las 24 horas.',
  })
  @ApiConsumes('multipart/form-data')
  @uploadBody('Documento Word (.docx), con o sin marcadores.')
  @ApiCreatedResponse({ type: DraftViewDto })
  createDraft(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: UploadTemplateDto,
    @UploadedFile() upload?: Express.Multer.File,
  ) {
    const file = requireDocx(upload);
    return this.templates.createDraft(
      municipality,
      body.documentType,
      { buffer: file.buffer, originalname: file.originalname },
      user.id,
    );
  }

  @Get('drafts/:draftId/content')
  @ApiOperation({
    summary:
      'Párrafos del borrador (encabezado, cuerpo y pie) con su blockId, texto, celda y fragmentos, y los marcadores que ya traía.',
  })
  draftContent(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('draftId') draftId: string,
  ) {
    return this.templates.draftContent(municipality.id, user.id, draftId);
  }

  @Post('drafts/:draftId/preview')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Aplica las selecciones al borrador, quita las filas indicadas y devuelve el PDF con datos de ejemplo ficticios. No guarda nada.',
  })
  @ApiProduces('application/pdf')
  async previewDraft(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('draftId') draftId: string,
    @Body() body: PreviewDraftDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.templates.previewDraft(
      municipality.id,
      user.id,
      draftId,
      body.selections,
      body.removedRows,
    );
    res.set({ 'Content-Type': 'application/pdf' });
    return new StreamableFile(pdf);
  }

  @Post('drafts/:draftId/save')
  @ApiOperation({
    summary:
      'Aplica las selecciones, quita las filas indicadas, valida los marcadores obligatorios y guarda el borrador como la nueva versión activa.',
  })
  saveDraft(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('draftId') draftId: string,
    @Body() body: SaveDraftDto,
  ) {
    return this.templates.saveDraft(
      municipality,
      user.id,
      draftId,
      body.selections,
      body.replaceConfirmed === true,
      body.removedRows,
      body.fileName,
    );
  }

  @Delete('drafts/:draftId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cancela el borrador y borra su archivo.' })
  @ApiNoContentResponse()
  async cancelDraft(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('draftId') draftId: string,
  ) {
    await this.templates.cancelDraft(municipality.id, user.id, draftId);
  }

  @Get(':id/content')
  @ApiOperation({
    summary:
      'Párrafos de una versión guardada (activa o anterior), con la misma forma que el contenido del borrador; appliedMarkers trae el nombre de cada marcador en label.',
  })
  @ApiNotFoundResponse({
    description: 'TEMPLATE_NOT_FOUND: no existe o es de otro municipio.',
  })
  content(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.templates.templateContent(municipality.id, id);
  }

  @Get(':id/preview')
  @ApiOperation({
    summary:
      'PDF de una versión guardada rellenado con los datos de ejemplo ficticios de la vista previa.',
  })
  @ApiProduces('application/pdf')
  @ApiNotFoundResponse({
    description: 'TEMPLATE_NOT_FOUND: no existe o es de otro municipio.',
  })
  async preview(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pdf = await this.templates.templatePreview(municipality.id, id);
    res.set({ 'Content-Type': 'application/pdf' });
    return new StreamableFile(pdf);
  }

  @Get(':id/download')
  @ApiOperation({
    summary:
      'Descarga el .docx guardado de una versión, idéntico al almacenado y con el nombre con que se subió.',
  })
  @ApiProduces(DOCX_TYPE)
  @ApiNotFoundResponse({
    description: 'TEMPLATE_NOT_FOUND: no existe o es de otro municipio.',
  })
  async download(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { fileName, stream } = await this.templates.templateFile(
      municipality.id,
      id,
    );
    // attachment() adds filename* when the name has characters outside
    // Latin-1, which a hand-written header would break on.
    res.attachment(fileName);
    res.set({ 'Content-Type': DOCX_TYPE });
    return new StreamableFile(stream);
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
