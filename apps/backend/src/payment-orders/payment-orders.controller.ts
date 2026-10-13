import {
  Body,
  Controller,
  Get,
  Post,
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
import { GeneratePaymentOrdersDto } from './generate-payment-orders.dto.js';
import { PaymentOrdersService } from './payment-orders.service.js';

@ApiTags('payment-orders')
@ApiBearerAuth()
@UseGuards(MunicipalityGuard)
@Controller('municipalities/:slug/payment-orders')
export class PaymentOrdersController {
  constructor(private readonly paymentOrders: PaymentOrdersService) {}

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
      'Genera el mandamiento de las liquidaciones indicadas que estén En firme (60 días desde la generación de su resolución). Las demás se devuelven en "rejected" con el motivo.',
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
}
