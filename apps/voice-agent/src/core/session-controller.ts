import { randomUUID } from 'node:crypto';
import {
  LessonEvent,
  nextStageStep,
  type AgentEventDecision,
  type AgentSessionContext,
  type AttemptSnapshot,
  type SessionEndReason,
  type StageMode,
} from '@safe-rehearse/agent-contracts';
import { z } from 'zod';
import type { BackendClient } from './backend-client.js';
import type { EvidenceExtractor, TranscriptLine } from './evidence-extractor.js';
import { noScreen, type LessonPresenter } from './lesson-presenter.js';
import { createLogger, errorFields, type Logger } from './logger.js';

/** Above this many unsent transcript lines, new lines are dropped rather than queued. */
const MAX_PENDING_TRANSCRIPTS = 20;

/** Extraction is tried this many times before the attempt is dropped ungraded. */
const EXTRACTION_ATTEMPTS = 2;
/** Pause before retrying, long enough to clear a brief rate limit. */
const EXTRACTION_RETRY_DELAY_MS = 4_000;

export interface SessionOptions {
  /** Finds assessment evidence in the exam transcript when the Examiner finishes. */
  extractor: EvidenceExtractor;
  /** Where visual lesson content goes. Defaults to nowhere. */
  presenter?: LessonPresenter;
}

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
  private controlLane: Promise<unknown> = Promise.resolve();
  private transcriptLane: Promise<unknown> = Promise.resolve();
  private pendingTranscripts = 0;
  /** Every line of this session, kept locally so evidence never depends on delivery to the backend. */
  private readonly transcript: (TranscriptLine & { mode: StageMode })[] = [];
  private readonly log: Logger;

  private constructor(
    private readonly backend: BackendClient,
    readonly context: AgentSessionContext,
    private snapshot: AttemptSnapshot,
    private readonly extractor: EvidenceExtractor,
    private readonly presenter: LessonPresenter,
  ) {
    this.log = createLogger('session', { attemptId: snapshot.id });
  }

  static async open(
    backend: BackendClient,
    attemptId: string,
    { extractor, presenter = noScreen }: SessionOptions,
  ): Promise<SessionController> {
    const context = await backend.getContext(attemptId);
    createLogger('session', { attemptId }).info('context loaded', {
      stage: context.stage.title,
      status: context.attempt.status,
      mode: context.attempt.mode,
      knowledgeItems: context.knowledge.length,
      criteria: context.criteria.length,
    });
    return new SessionController(backend, context, context.attempt, extractor, presenter);
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

  /**
   * Fire-and-forget on its own lane: a slow or lost transcript line must never
   * stall the conversation or delay a tool call. One delivery attempt, and new
   * lines are dropped (with a warning) if the backlog grows too long.
   */
  recordTranscript(speaker: 'LEARNER' | 'AGENT', text: string): void {
    if (!this.isLive || !text.trim()) return;
    this.transcript.push({ mode: this.mode, speaker, text });
    if (this.pendingTranscripts >= MAX_PENDING_TRANSCRIPTS) {
      this.log.warn('transcript backlog full; dropping line', {
        speaker,
        pending: this.pendingTranscripts,
      });
      return;
    }
    this.pendingTranscripts++;
    const payload = { type: 'transcript', mode: this.mode, speaker, text } as const;
    const result = this.transcriptLane.then(async () => {
      const decision = await this.backend.sendEvent(this.snapshot.id, payload, { maxAttempts: 1 });
      // Transcript replies never update the snapshot: one could arrive after a
      // control event and overwrite newer state.
      this.logDecision(payload, decision, this.snapshot);
    });
    this.transcriptLane = result
      .catch((error: unknown) =>
        this.log.warn('transcript event lost', { speaker, ...errorFields(error) }),
      )
      .finally(() => this.pendingTranscripts--);
  }

  /** Sends one piece of evidence. The backend checks the mode, criterion and confidence. */
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

  /**
   * Shows visual lesson content on the learner's screen. Purely presentational:
   * it changes no attempt state, so it skips the backend and returns at once.
   */
  present(event: LessonEvent): ToolOutcome {
    if (!this.isLive) {
      return { accepted: false, message: 'The session has ended, so nothing was shown.' };
    }
    const parsed = LessonEvent.safeParse(event);
    if (!parsed.success) {
      this.log.warn('lesson event invalid; not shown', { issues: z.prettifyError(parsed.error) });
      return {
        accepted: false,
        message: `Not shown: ${z.prettifyError(parsed.error)} Carry on teaching without it.`,
      };
    }
    this.presenter.show({
      version: '1',
      id: randomUUID(),
      mode: this.mode,
      sentAt: new Date().toISOString(),
      event: parsed.data,
    });
    this.log.info('lesson event shown', { kind: parsed.data.kind, title: parsed.data.title });
    return {
      accepted: true,
      message:
        "It is on the learner's screen now. Carry on speaking naturally; do not read it out word for word.",
    };
  }

  /** Asks the backend to move on from the current mode. The backend decides. */
  async completeMode(): Promise<ToolOutcome> {
    const from = this.mode;
    const to = nextStageStep(from);

    if (to === 'ASSESSMENT' && this.isLive) {
      const exam = this.transcript.filter((l) => l.mode === 'EXAMINER');
      if (!exam.some((l) => l.speaker === 'LEARNER')) {
        return {
          accepted: false,
          message:
            'The learner has not responded in the assessed role-play yet. Carry on with it, and give them the chance to respond.',
        };
      }
      const gathered = await this.gatherEvidence(exam);
      if (!gathered) {
        await this.end('agent_error', 'could not assess the exam transcript');
        return {
          accepted: false,
          message:
            'SafeRehearse could not record the result of this assessment because of a technical problem. ' +
            'Tell the learner kindly and briefly that this attempt will not be graded and that they can start a ' +
            'fresh attempt, then say goodbye.',
        };
      }
    }

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

  /**
   * Runs the extractor over the exam transcript and submits what it finds, before
   * the backend grades. Returns false if no answer could be obtained at all.
   */
  private async gatherEvidence(exam: TranscriptLine[]): Promise<boolean> {
    for (let attempt = 1; attempt <= EXTRACTION_ATTEMPTS; attempt++) {
      if (attempt > 1) await new Promise((r) => setTimeout(r, EXTRACTION_RETRY_DELAY_MS));
      const startedAt = Date.now();
      try {
        const findings = await this.extractor.extract({ context: this.context, transcript: exam });
        this.log.info('evidence extracted from exam transcript', {
          extractor: this.extractor.id,
          lines: exam.length,
          found: findings.map((f) => `${f.criterionId} (${f.confidence})`),
          ms: Date.now() - startedAt,
        });
        for (const f of findings) {
          await this.recordEvidence(f.criterionId, f.evidence, f.confidence);
        }
        return true;
      } catch (error) {
        this.log.warn('evidence extraction failed', {
          attempt,
          of: EXTRACTION_ATTEMPTS,
          ms: Date.now() - startedAt,
          ...errorFields(error),
        });
      }
    }
    return false;
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
   * State-changing events (session, evidence, feedback, transitions) go out one at
   * a time, in order, on the control lane. Transcripts use their own lane so they
   * can never delay these.
   */
  private send(payload: Parameters<BackendClient['sendEvent']>[1]): Promise<AgentEventDecision> {
    const result = this.controlLane.then(async () => {
      const before = this.snapshot;
      const decision = await this.backend.sendEvent(this.snapshot.id, payload);
      if (decision.attempt) this.snapshot = decision.attempt;
      this.logDecision(payload, decision, before);
      return decision;
    });
    this.controlLane = result.catch(() => undefined);
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
