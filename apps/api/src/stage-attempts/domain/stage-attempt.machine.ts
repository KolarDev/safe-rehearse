import {
  nextStageStep,
  type AttemptStatus,
  type RejectionReason,
  type StageMode,
  type StageTransitionEvent,
} from '@safe-rehearse/agent-contracts';

/**
 * StageAttempt rules. Pure functions with no I/O: this is where "the model
 * requests, the backend decides" is enforced.
 */

export interface AttemptState {
  status: AttemptStatus;
  mode: StageMode;
}

export type Verdict<T> =
  { ok: true; value: T } | { ok: false; reason: RejectionReason; message: string };

const reject = (reason: RejectionReason, message: string) =>
  ({ ok: false, reason, message }) as const;

function requireInProgress(state: AttemptState): Verdict<null> {
  return state.status === 'IN_PROGRESS'
    ? { ok: true, value: null }
    : reject(
        'ATTEMPT_NOT_IN_PROGRESS',
        `This attempt is ${state.status} and can no longer change.`,
      );
}

/** Modes only move forward, one step at a time, starting from the current mode. */
export function decideTransition(
  state: AttemptState,
  request: Pick<StageTransitionEvent, 'from' | 'to'>,
): Verdict<StageMode | 'ASSESSMENT'> {
  const live = requireInProgress(state);
  if (!live.ok) return live;

  if (request.from !== state.mode) {
    return reject('WRONG_MODE', `The attempt is in ${state.mode}, not ${request.from}.`);
  }
  const expected = nextStageStep(state.mode);
  if (request.to !== expected) {
    return reject(
      'INVALID_TRANSITION',
      `From ${state.mode} the only allowed next step is ${expected}.`,
    );
  }
  return { ok: true, value: expected };
}

/** Graded evidence only counts in the Examiner mode. */
export function decideEvidence(state: AttemptState, eventMode: StageMode): Verdict<null> {
  const live = requireInProgress(state);
  if (!live.ok) return live;

  if (eventMode !== state.mode) {
    return reject('WRONG_MODE', `The attempt is in ${state.mode}, not ${eventMode}.`);
  }
  if (state.mode !== 'EXAMINER') {
    return reject(
      'EVIDENCE_NOT_ALLOWED_IN_MODE',
      'Assessment evidence can only be recorded during the Examiner mode.',
    );
  }
  return { ok: true, value: null };
}

/** Transcript and feedback are records: allowed while the attempt is live and in that mode. */
export function decideRecord(state: AttemptState, eventMode: StageMode): Verdict<null> {
  const live = requireInProgress(state);
  if (!live.ok) return live;

  return eventMode === state.mode
    ? { ok: true, value: null }
    : reject('WRONG_MODE', `The attempt is in ${state.mode}, not ${eventMode}.`);
}

/**
 * A session that ends while the attempt is still IN_PROGRESS always drops it,
 * whatever the reason. Once an attempt is graded or dropped, a later session end
 * changes nothing.
 */
export function decideSessionEnd(state: AttemptState): 'DROP' | 'NO_CHANGE' {
  return state.status === 'IN_PROGRESS' ? 'DROP' : 'NO_CHANGE';
}
