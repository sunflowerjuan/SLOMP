import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { AssistantConversationService } from './assistant-conversation.service.js';
import { AssistantMessageDto } from './assistant-message.dto.js';
import {
  AssistantRateLimitedException,
  AssistantRateLimiter,
} from './assistant-rate-limiter.js';
import { AssistantToolsService } from './assistant-tools.service.js';

// Slompsim's conversation, and the status changes it proposes (or that the
// panel's status buttons build), which are applied without the model.
@ApiTags('assistant')
@ApiBearerAuth()
@UseGuards(MunicipalityGuard)
@Controller('municipalities/:slug/assistant')
export class AssistantController {
  constructor(
    private readonly tools: AssistantToolsService,
    private readonly changes: AssistantChangesService,
    private readonly conversation: AssistantConversationService,
    private readonly rateLimiter: AssistantRateLimiter,
  ) {}

  @Post('messages')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Envía un mensaje a Slompsim con el historial que guarda el cliente. Responde el texto y los cambios propuestos ya validados, que se aplican con changes/confirm. No cambia nada.',
  })
  message(
    @CurrentMunicipality() municipality: MunicipalityContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: AssistantMessageDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      this.rateLimiter.consume(user.id);
    } catch (error) {
      if (error instanceof AssistantRateLimitedException) {
        res.setHeader('Retry-After', String(error.retryAfterSeconds));
      }
      throw error;
    }
    const requestId = res.getHeader('X-Request-Id');
    return this.conversation.reply(
      municipality.id,
      body,
      typeof requestId === 'string' ? requestId : randomUUID(),
    );
  }

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
