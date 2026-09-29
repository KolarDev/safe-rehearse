import {
  nextStageStep,
  type AgentEventDecision,
  type AgentSessionContext,
  type AttemptSnapshot,
  type SessionEndReason,
  type StageMode,
} from '@safe-rehearse/agent-contracts';
import type { BackendClient } from './backend-client.js';

/** What a tool call tells the model, plus an optional mode switch for the transport to perform. */
export interface ToolOutcome {
  /** Whether the backend accepted the underlying event. */
  accepted: boolean;
  message: string;
  nextMode?: StageMode;
}

/**
 * Provider- and transport-independent session core. Holds the backend-issued
 * context, tracks the mode the BACKEND says we are in, and turns agent actions
 * into contract events. It never decides outcomes itself.
 */
export class SessionController {
  private ended = false;

  private constructor(
    private readonly backend: BackendClient,
    readonly context: AgentSessionContext,
    private snapshot: AttemptSnapshot,
  ) {}

  static async open(backend: BackendClient, attemptId: string): Promise<SessionController> {
    const context = await backend.getContext(attemptId);
    return new SessionController(backend, context, context.attempt);
  }

  get attempt(): AttemptSnapshot {
    return this.snapshot;
  }

  get mode(): StageMode {
    return this.snapshot.mode;
  }

  get isLive(): boolean {
    return this.snapshot.status === 'IN_PROGRESS' && !this.ended;
  }

  async start(): Promise<boolean> {
    const decision = await this.send({ type: 'session', event: 'started' });
    return decision.accepted;
  }

  /** Fire-and-forget: a lost transcript line must never stall the conversation. */
  recordTranscript(speaker: 'LEARNER' | 'AGENT', text: string): void {
    if (!this.isLive || !text.trim()) return;
    this.send({ type: 'transcript', mode: this.mode, speaker, text }).catch((error: unknown) =>
      console.warn('transcript event failed', error),
    );
  }

  async recordEvidence(
    criterionId: string,
    evidence: string,
    confidence: number,
  ): Promise<ToolOutcome> {
    const decision = await this.send({
      type: 'evidence',
      mode: this.mode,
      criterionId,
      evidence,
      confidence,
    });
    return decision.accepted
      ? {
          accepted: true,
          message:
            'Evidence recorded. Continue the assessment without mentioning it to the learner.',
        }
      : { accepted: false, message: `Evidence not recorded: ${decision.message}` };
  }

  async recordFeedback(message: string): Promise<ToolOutcome> {
    const decision = await this.send({ type: 'feedback', mode: this.mode, message });
    return decision.accepted
      ? { accepted: true, message: 'Feedback recorded.' }
      : { accepted: false, message: `Feedback not recorded: ${decision.message}` };
  }

  /** Asks the backend to move on from the current mode. The backend decides. */
  async completeMode(): Promise<ToolOutcome> {
    const from = this.mode;
    const to = nextStageStep(from);
    const decision = await this.send({ type: 'stage_transition_requested', from, to });

    if (!decision.accepted) {
      return {
        accepted: false,
        message: `SafeRehearse did not move on: ${decision.message} Carry on with the current part.`,
      };
    }
    if (to === 'ASSESSMENT') {
      return {
        accepted: true,
        message:
          'This stage is finished and SafeRehearse has recorded the result, which the learner can now see on screen. ' +
          'Thank the learner warmly and say goodbye. Do not tell them whether they passed.',
      };
    }
    return { accepted: true, message: `Moving on to the ${describeMode(to)} part.`, nextMode: to };
  }

  /** Reports the end of the session exactly once. The backend drops the attempt if it is ungraded. */
  async end(reason: SessionEndReason, detail?: string): Promise<void> {
    if (this.ended) return;
    this.ended = true;
    try {
      await this.send({ type: 'session', event: 'ended', reason, detail });
    } catch (error) {
      console.error('failed to report session end', error);
    }
  }

  private async send(
    payload: Parameters<BackendClient['sendEvent']>[1],
  ): Promise<AgentEventDecision> {
    const decision = await this.backend.sendEvent(this.snapshot.id, payload);
    if (decision.attempt) this.snapshot = decision.attempt;
    return decision;
  }
}

export function describeMode(mode: StageMode): string {
  return { TEACHER: 'teaching', PRACTICE_PARTNER: 'practice', EXAMINER: 'assessment' }[mode];
}
