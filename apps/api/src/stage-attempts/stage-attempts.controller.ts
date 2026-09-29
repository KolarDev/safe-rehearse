import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  StartAttemptRequest,
  type AttemptSnapshot,
  type VoiceSessionResponse,
} from '@safe-rehearse/types';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { VoiceSessionService } from '../voice/voice-session.service.js';
import { StageAttemptsService } from './stage-attempts.service.js';

/** Learner-facing attempt lifecycle. Authentication will wrap these routes later. */
@Controller('stage-attempts')
export class StageAttemptsController {
  constructor(
    private readonly attempts: StageAttemptsService,
    private readonly voice: VoiceSessionService,
  ) {}

  /** Starts a new attempt. Calling this again for the same stage is a retry. */
  @Post()
  start(
    @Body(new ZodValidationPipe(StartAttemptRequest)) body: StartAttemptRequest,
  ): Promise<AttemptSnapshot> {
    return this.attempts.start(body.stageId, body.learnerRef);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<AttemptSnapshot> {
    return this.attempts.get(id);
  }

  @Post(':id/voice-session')
  voiceSession(@Param('id') id: string): Promise<VoiceSessionResponse> {
    return this.voice.issue(id);
  }

  @Post(':id/abandon')
  @HttpCode(200)
  abandon(@Param('id') id: string): Promise<AttemptSnapshot> {
    return this.attempts.abandon(id);
  }
}
