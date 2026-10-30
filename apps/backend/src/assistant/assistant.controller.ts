import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/jwt.strategy.js';
import { CurrentMunicipality } from '../municipalities/current-municipality.decorator.js';
import type { MunicipalityContext } from '../municipalities/municipality-context.js';
import { MunicipalityGuard } from '../municipalities/municipality.guard.js';
import {
  ConfirmStatusChangesDto,
  StatusChangesDto,
} from './assistant-changes.dto.js';
import { AssistantChangesService } from './assistant-changes.service.js';
import { AssistantToolsService } from './assistant-tools.service.js';

// Status changes proposed by Slompsim, or built by the panel's status
// buttons, go through here without the model.
@ApiTags('assistant')
@ApiBearerAuth()
@UseGuards(MunicipalityGuard)
@Controller('municipalities/:slug/assistant')
export class AssistantController {
  constructor(
    private readonly tools: AssistantToolsService,
    private readonly changes: AssistantChangesService,
  ) {}

  @Post('changes/preview')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Valida cambios de estado con las reglas del dominio, igual que propose_status_change. No cambia nada.',
  })
  preview(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @Body() body: StatusChangesDto,
  ) {
    return this.tools.proposeStatusChange(municipality.id, body.changes);
  }

  @Post('changes/confirm')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Aplica exactamente los cambios indicados, todos o ninguno: si alguno ya no se permite responde 409 con los rechazados y no cambia nada. Cada cambio queda auditado.',
  })
  confirm(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: ConfirmStatusChangesDto,
  ) {
    return this.changes.confirm(
      municipality.id,
      user.id,
      body.changes,
      body.note,
    );
  }
}
