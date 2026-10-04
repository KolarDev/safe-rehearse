import {
  nextStageStep,
  type AgentEventDecision,
  type AgentSessionContext,
  type AttemptSnapshot,
  type SessionEndReason,
  type StageMode,
} from '@safe-rehearse/agent-contracts';
import type { BackendClient } from './backend-client.js';
import { createLogger, errorFields, type Logger } from './logger.js';

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
  private outbox: Promise<unknown> = Promise.resolve();
  private readonly log: Logger;

  private constructor(
    private readonly backend: BackendClient,
    readonly context: AgentSessionContext,
    private snapshot: AttemptSnapshot,
  ) {
    this.log = createLogger('session', { attemptId: snapshot.id });
  }

  static async open(backend: BackendClient, attemptId: string): Promise<SessionController> {
    const context = await backend.getContext(attemptId);
    createLogger('session', { attemptId }).info('context loaded', {
      stage: context.stage.title,
      status: context.attempt.status,
      mode: context.attempt.mode,
      knowledgeItems: context.knowledge.length,
      criteria: context.criteria.length,
    });
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
      this.log.warn('transcript event lost', { speaker, ...errorFields(error) }),
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
    this.log.info('reporting session end', { reason, detail });
    try {
      await this.send({ type: 'session', event: 'ended', reason, detail });
    } catch (error) {
      this.log.error('failed to report session end; attempt may stay IN_PROGRESS', {
        reason,
        ...errorFields(error),
      });
    }
  }

  /**
   * Events go out one at a time, in order. The backend serialises per attempt
   * anyway; sending concurrently only made requests queue on its row lock and
   * could deliver transcript lines out of order.
   */
  private send(payload: Parameters<BackendClient['sendEvent']>[1]): Promise<AgentEventDecision> {
    const result = this.outbox.then(async () => {
      const before = this.snapshot;
      const decision = await this.backend.sendEvent(this.snapshot.id, payload);
      if (decision.attempt) this.snapshot = decision.attempt;
      this.logDecision(payload, decision, before);
      return decision;
    });
    this.outbox = result.catch(() => undefined);
    return result;
  }

  private logDecision(
    payload: Parameters<BackendClient['sendEvent']>[1],
    decision: AgentEventDecision,
    before: AttemptSnapshot,
  ): void {
    const event = payload.type === 'session' ? `session:${payload.event}` : payload.type;
    if (!decision.accepted) {
      this.log.warn('backend rejected event', {
        event,
        reason: decision.reason,
        message: decision.message,
      });
    } else if (payload.type === 'transcript') {
      this.log.debug('transcript recorded', { speaker: payload.speaker, text: payload.text });
    } else {
      this.log.info('backend accepted event', { event });
    }

    const after = this.snapshot;
    if (after.mode !== before.mode) {
      this.log.info('mode changed', { from: before.mode, to: after.mode });
    }
    if (after.status !== before.status) {
      const fields = { from: before.status, to: after.status };
      if (after.status === 'DROPPED') this.log.warn('attempt dropped', fields);
      else this.log.info('attempt status changed', fields);
    }
  }
}

export function describeMode(mode: StageMode): string {
  return { TEACHER: 'teaching', PRACTICE_PARTNER: 'practice', EXAMINER: 'assessment' }[mode];
}
