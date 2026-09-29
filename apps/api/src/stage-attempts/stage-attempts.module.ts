import { Module } from '@nestjs/common';
import { VoiceSessionService } from '../voice/voice-session.service.js';
import { StageAttemptsController } from './stage-attempts.controller.js';
import { StageAttemptsService } from './stage-attempts.service.js';

@Module({
  controllers: [StageAttemptsController],
  providers: [StageAttemptsService, VoiceSessionService],
  exports: [StageAttemptsService],
})
export class StageAttemptsModule {}
