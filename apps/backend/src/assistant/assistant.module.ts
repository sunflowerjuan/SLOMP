import { Module } from '@nestjs/common';
import { AssistantChangesService } from './assistant-changes.service.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantToolsService } from './assistant-tools.service.js';

@Module({
  controllers: [AssistantController],
  providers: [AssistantToolsService, AssistantChangesService],
  // The payment orders import reuses find_unlisted_periods.
  exports: [AssistantToolsService],
})
export class AssistantModule {}
