import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  AgentEventEnvelope,
  type AgentEventDecision,
  type AgentSessionContext,
} from '@safe-rehearse/agent-contracts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { StageAttemptsService } from '../stage-attempts/stage-attempts.service.js';
import { AgentAuthGuard } from './agent-auth.guard.js';
import { AgentContextService } from './agent-context.service.js';

/**
 * The only way the voice agent talks to SafeRehearse. It reads context and
 * submits events; the backend decides what they mean.
 */
@Controller('agent/attempts/:attemptId')
@UseGuards(AgentAuthGuard)
export class AgentGatewayController {
  constructor(
    private readonly context: AgentContextService,
    private readonly attempts: StageAttemptsService,
  ) {}

  @Get('context')
  getContext(@Param('attemptId') attemptId: string): Promise<AgentSessionContext> {
    return this.context.forAttempt(attemptId);
  }

  /** Always 200 with a decision: a rejected event is a normal answer, not an HTTP error. */
  @Post('events')
  @HttpCode(200)
  submitEvent(
    @Param('attemptId') attemptId: string,
    @Body(new ZodValidationPipe(AgentEventEnvelope)) envelope: AgentEventEnvelope,
  ): Promise<AgentEventDecision> {
    if (envelope.attemptId !== attemptId) {
      throw new BadRequestException('attemptId in the path and body must match');
    }
    return this.attempts.applyAgentEvent(envelope);
  }
}
