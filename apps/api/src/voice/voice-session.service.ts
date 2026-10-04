import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgentDispatchMetadata } from '@safe-rehearse/agent-contracts';
import type { VoiceSessionResponse } from '@safe-rehearse/types';
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Issues the learner's LiveKit token and dispatches the voice agent into the room.
 * LiveKit is the realtime transport. Which model the agent uses is the
 * voice-agent's concern, not the backend's.
 */
@Injectable()
export class VoiceSessionService {
  private readonly logger = new Logger('VoiceSession');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issue(attemptId: string): Promise<VoiceSessionResponse> {
    // Conditional update: exactly one voice session per attempt, even under concurrent calls.
    const { count } = await this.prisma.stageAttempt.updateMany({
      where: { id: attemptId, status: 'IN_PROGRESS', voiceSessionIssuedAt: null },
      data: { voiceSessionIssuedAt: new Date() },
    });
    if (count === 0) {
      const exists = await this.prisma.stageAttempt.count({ where: { id: attemptId } });
      if (!exists) {
        this.logger.warn(`voice session refused: attempt ${attemptId} not found`);
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      this.logger.warn(
        `voice session refused for ${attemptId}: already issued or attempt not in progress`,
      );
      throw new ConflictException(
        'This attempt already had its voice session or is no longer in progress. Start a new attempt to retry.',
      );
    }

    const roomName = `attempt-${attemptId}`;
    const metadata: AgentDispatchMetadata = { attemptId };

    const token = new AccessToken(
      this.config.get('LIVEKIT_API_KEY', { infer: true }),
      this.config.get('LIVEKIT_API_SECRET', { infer: true }),
      { identity: `learner-${attemptId}`, ttl: '30m' },
    );
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    token.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: this.config.get('LIVEKIT_AGENT_NAME', { infer: true }),
          metadata: JSON.stringify(metadata),
        }),
      ],
    });

    const agentName = this.config.get('LIVEKIT_AGENT_NAME', { infer: true });
    this.logger.log(
      `voice session issued for ${attemptId}: room ${roomName}, agent "${agentName}" dispatched on join`,
    );
    return {
      serverUrl: this.config.get('LIVEKIT_URL', { infer: true }),
      roomName,
      participantToken: await token.toJwt(),
    };
  }
}
