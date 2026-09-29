import { z } from 'zod';

/**
 * The three voice modes of a stage, in the order a learner moves through them.
 * The agent plays one role per mode.
 */
export const StageMode = z.enum(['TEACHER', 'PRACTICE_PARTNER', 'EXAMINER']);
export type StageMode = z.infer<typeof StageMode>;

export const STAGE_MODE_ORDER: readonly StageMode[] = ['TEACHER', 'PRACTICE_PARTNER', 'EXAMINER'];

/** The step after `mode`: the next mode, or ASSESSMENT after the Examiner. */
export function nextStageStep(mode: StageMode): StageMode | 'ASSESSMENT' {
  return STAGE_MODE_ORDER[STAGE_MODE_ORDER.indexOf(mode) + 1] ?? 'ASSESSMENT';
}

/**
 * Lifecycle of a StageAttempt. Only the backend moves an attempt between these.
 * - IN_PROGRESS: the learner is in the stage (see `mode` for where).
 * - DROPPED:     interrupted before a result. Never graded; retry creates a new attempt.
 * - PASSED / FAILED: graded by the backend's assessment rules after the Examiner mode.
 */
export const AttemptStatus = z.enum(['IN_PROGRESS', 'DROPPED', 'PASSED', 'FAILED']);
export type AttemptStatus = z.infer<typeof AttemptStatus>;

export const CriterionResult = z.object({
  criterionId: z.string(),
  description: z.string(),
  met: z.boolean(),
});
export type CriterionResult = z.infer<typeof CriterionResult>;

/** Backend-owned view of an attempt, returned to both the agent and the web client. */
export const AttemptSnapshot = z.object({
  id: z.string(),
  stageId: z.string(),
  status: AttemptStatus,
  mode: StageMode,
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  /** Present only once the attempt is PASSED or FAILED. */
  result: z
    .object({
      criteria: z.array(CriterionResult),
    })
    .nullable(),
});
export type AttemptSnapshot = z.infer<typeof AttemptSnapshot>;
