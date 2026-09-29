// Shared web ↔ API types. The agent ↔ API boundary lives in @safe-rehearse/agent-contracts.
import { AttemptSnapshot } from '@safe-rehearse/agent-contracts';
import { z } from 'zod';

export { AttemptSnapshot };

export const StageSummary = z.object({
  id: z.string(),
  title: z.string(),
  position: z.number().int(),
  scenario: z.object({ id: z.string(), title: z.string() }),
});
export type StageSummary = z.infer<typeof StageSummary>;

/** POST /stage-attempts. Starting a stage again is how a learner retries it. */
export const StartAttemptRequest = z.object({
  stageId: z.string().min(1),
  /** Temporary learner identifier until authentication exists. */
  learnerRef: z.string().trim().min(1).max(100),
});
export type StartAttemptRequest = z.infer<typeof StartAttemptRequest>;

/** POST /stage-attempts/:id/voice-session */
export const VoiceSessionResponse = z.object({
  serverUrl: z.string(),
  roomName: z.string(),
  participantToken: z.string(),
});
export type VoiceSessionResponse = z.infer<typeof VoiceSessionResponse>;
