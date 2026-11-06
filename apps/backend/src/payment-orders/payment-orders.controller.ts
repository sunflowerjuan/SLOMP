import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
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
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { CurrentMunicipality } from '../municipalities/current-municipality.decorator.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { MunicipalityGuard } from '../municipalities/municipality.guard.js';
import {
  assertUploadedXlsx,
  TAX_ROLL_UPLOAD_LIMITS,
  TaxRollFileTooLargeFilter,
} from '../tax-roll/tax-roll-upload.js';
import { GeneratePaymentOrderPdfService } from './generate-payment-order-pdf.service.js';
import { GeneratePaymentOrdersDto } from './generate-payment-orders.dto.js';
import { PaymentOrdersService } from './payment-orders.service.js';

@ApiTags('payment-orders')
@ApiBearerAuth()
@UseGuards(MunicipalityGuard)
@Controller('municipalities/:slug/payment-orders')
export class PaymentOrdersController {
  constructor(
    private readonly paymentOrders: PaymentOrdersService,
    private readonly paymentOrderPdf: GeneratePaymentOrderPdfService,
  ) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: TAX_ROLL_UPLOAD_LIMITS }))
  @UseFilters(TaxRollFileTooLargeFilter)
  @ApiOperation({
    summary:
      'Lee el Excel de mandamientos (mismas columnas y validaciones que la cartera) e indica a qué periodos se les puede generar mandamiento. No guarda nada.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  import(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    assertUploadedXlsx(file);
    return this.paymentOrders.previewImport(
      municipality,
      file.buffer,
      file.originalname,
    );
  }

  @Post()
  @ApiOperation({
    summary:
      'Genera un mandamiento por predio con las liquidaciones indicadas que estén En firme (60 días desde la generación de su resolución). Las demás se devuelven en "rejected" con el motivo.',
  })
  generate(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: GeneratePaymentOrdersDto,
  ) {
    return this.paymentOrders.generate(
      municipality.id,
      user.id,
      body.settlementIds,
    );
  }

  @Get()
  @ApiOperation({
    summary:
      'Lista los mandamientos del municipio, el más reciente primero (máximo 100).',
  })
  list(@CurrentMunicipality() municipality: MunicipalityContext) {
    return this.paymentOrders.list(municipality.id);
  }

  @Post(':id/pdf')
  @ApiOperation({
    summary:
      'Descarga el PDF de un mandamiento ya generado. No reserva número: se puede repetir.',
  })
  async pdf(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { pdf, number } = await this.paymentOrderPdf.generate(
      municipality.id,
      id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="MP-${number}.pdf"`,
    });
    return new StreamableFile(pdf);
  }
}
