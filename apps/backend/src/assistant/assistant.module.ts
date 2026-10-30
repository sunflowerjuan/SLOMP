import { Module } from '@nestjs/common';
import { AssistantChangesService } from './assistant-changes.service.js';
import { AssistantConversationService } from './assistant-conversation.service.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantRateLimiter } from './assistant-rate-limiter.js';
import { AssistantToolsService } from './assistant-tools.service.js';
import { ASSISTANT_MODEL } from './model/assistant-model.js';
import { createAssistantModel } from './model/assistant-model.factory.js';

@Module({
  controllers: [AssistantController],
  providers: [
    AssistantToolsService,
    AssistantChangesService,
    AssistantConversationService,
    AssistantRateLimiter,
    // Chosen by the environment; null turns the conversation off (503).
    {
      provide: ASSISTANT_MODEL,
      useFactory: () => createAssistantModel(process.env),
    },
  ],
  // The payment orders import reuses find_unlisted_periods.
  exports: [AssistantToolsService],
})
export class AssistantModule {}
