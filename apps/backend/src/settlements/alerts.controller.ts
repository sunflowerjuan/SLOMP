import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentMunicipality } from '../municipalities/current-municipality.decorator.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { MunicipalityGuard } from '../municipalities/municipality.guard.js';
import { AlertsService } from './alerts.service.js';

@UseGuards(MunicipalityGuard)
@Controller('municipalities/:slug/alerts')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('summary')
  summary(@CurrentMunicipality() municipality: MunicipalityContext) {
    return this.alertsService.summary(municipality.id);
  }
}
