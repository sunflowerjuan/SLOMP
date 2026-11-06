import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentMunicipality } from './current-municipality.decorator.js';
import type { MunicipalityContext } from './municipality-context.js';
import {
  CreateMunicipalityDto,
  UpdateMunicipalityDto,
} from './municipality.dto.js';
import { MunicipalityGuard } from './municipality.guard.js';
import { MunicipalitiesService } from './municipalities.service.js';

// There is no DELETE: a municipality with data is never removed.
@ApiTags('municipalities')
@ApiBearerAuth()
@Controller('municipalities')
export class MunicipalitiesController {
  constructor(private readonly municipalities: MunicipalitiesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista los municipios (para el selector del panel).',
  })
  list() {
    return this.municipalities.list();
  }

  @Post()
  @ApiOperation({
    summary:
      'Crea un municipio. Si no se envía "slug", se sugiere a partir del nombre.',
  })
  create(@Body() body: CreateMunicipalityDto) {
    return this.municipalities.create(body);
  }

  @Patch(':slug')
  @UseGuards(MunicipalityGuard)
  @ApiOperation({
    summary:
      'Edita un municipio. El slug y el código DANE no cambian cuando ya tiene datos.',
  })
  update(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Body() body: UpdateMunicipalityDto,
  ) {
    return this.municipalities.update(municipality, body);
  }
}
