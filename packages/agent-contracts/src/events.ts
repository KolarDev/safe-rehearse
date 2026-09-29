import { z } from 'zod';
import { AttemptSnapshot, StageMode } from './domain.js';

/**
 * Events flow one way: voice-agent → backend.
 *
 * The agent REPORTS what happened (transcript, evidence, feedback) and REQUESTS
 * changes (transitions, session end). It never decides outcomes. The backend
 * validates every event against the attempt's current state and replies with an
 * {@link AgentEventDecision}.
 */

export const TranscriptEvent = z.object({
  type: z.literal('transcript'),
  mode: StageMode,
  speaker: z.enum(['LEARNER', 'AGENT']),
  text: z.string().min(1),
});
export type TranscriptEvent = z.infer<typeof TranscriptEvent>;

/** Something the learner said or did that bears on an assessment criterion. */
export const EvidenceEvent = z.object({
  type: z.literal('evidence'),
  mode: StageMode,
  criterionId: z.string().min(1),
  evidence: z.string().min(1),
  /** The model's own confidence. The backend applies its own threshold. */
  confidence: z.number().min(0).max(1),
});
export type EvidenceEvent = z.infer<typeof EvidenceEvent>;

/**
 * The agent believes the current mode is finished and asks to move on.
 * `to: 'ASSESSMENT'` from EXAMINER means "the exam is over, please grade".
 */
export const StageTransitionEvent = z.object({
  type: z.literal('stage_transition_requested'),
  from: StageMode,
  to: z.union([StageMode, z.literal('ASSESSMENT')]),
});
export type StageTransitionEvent = z.infer<typeof StageTransitionEvent>;

/** Formative feedback the agent gave the learner. Recorded, never graded. */
export const FeedbackEvent = z.object({
  type: z.literal('feedback'),
  mode: StageMode,
  message: z.string().min(1),
});
export type FeedbackEvent = z.infer<typeof FeedbackEvent>;

export const SessionEndReason = z.enum([
  /** Normal end after the backend has graded the attempt. */
  'completed',
  'participant_left',
  'network_failure',
  'agent_error',
  'timeout',
]);
export type SessionEndReason = z.infer<typeof SessionEndReason>;

export const SessionEvent = z.discriminatedUnion('event', [
  z.object({ type: z.literal('session'), event: z.literal('started') }),
  z.object({
    type: z.literal('session'),
    event: z.literal('ended'),
    reason: SessionEndReason,
    detail: z.string().optional(),
  }),
]);
export type SessionEvent = z.infer<typeof SessionEvent>;

export const AgentEventPayload = z.union([
  TranscriptEvent,
  EvidenceEvent,
  StageTransitionEvent,
  FeedbackEvent,
  SessionEvent,
]);
export type AgentEventPayload = z.infer<typeof AgentEventPayload>;
export type AgentEventType = AgentEventPayload['type'];

export const AgentEventEnvelope = z.object({
  contractVersion: z.literal('1'),
  /** Client-generated UUID. The backend deduplicates on it, so retries are safe. */
  eventId: z.uuid(),
  attemptId: z.string().min(1),
  occurredAt: z.iso.datetime(),
  payload: AgentEventPayload,
});
export type AgentEventEnvelope = z.infer<typeof AgentEventEnvelope>;

export const RejectionReason = z.enum([
  'ATTEMPT_NOT_FOUND',
  'ATTEMPT_NOT_IN_PROGRESS',
  'WRONG_MODE',
  'INVALID_TRANSITION',
  'UNKNOWN_CRITERION',
  'EVIDENCE_NOT_ALLOWED_IN_MODE',
]);
export type RejectionReason = z.infer<typeof RejectionReason>;

/** The backend's answer to every event. */
export const AgentEventDecision = z.discriminatedUnion('accepted', [
  z.object({
    accepted: z.literal(true),
    attempt: AttemptSnapshot,
  }),
  z.object({
    accepted: z.literal(false),
    reason: RejectionReason,
    /** Human-readable explanation, safe to hand back to the model. */
    message: z.string(),
    attempt: AttemptSnapshot.nullable(),
  }),
]);
export type AgentEventDecision = z.infer<typeof AgentEventDecision>;
