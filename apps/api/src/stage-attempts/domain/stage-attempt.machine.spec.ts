import { describe, expect, it } from 'vitest';
import { assess } from './assessment.js';
import {
  decideEvidence,
  decideRecord,
  decideSessionEnd,
  decideTransition,
  type AttemptState,
} from './stage-attempt.machine.js';

const live = (mode: AttemptState['mode']): AttemptState => ({ status: 'IN_PROGRESS', mode });

describe('decideTransition', () => {
  it('moves forward one mode at a time', () => {
    expect(decideTransition(live('TEACHER'), { from: 'TEACHER', to: 'PRACTICE_PARTNER' })).toEqual({
      ok: true,
      value: 'PRACTICE_PARTNER',
    });
    expect(
      decideTransition(live('PRACTICE_PARTNER'), { from: 'PRACTICE_PARTNER', to: 'EXAMINER' }),
    ).toMatchObject({
      ok: true,
    });
    expect(decideTransition(live('EXAMINER'), { from: 'EXAMINER', to: 'ASSESSMENT' })).toEqual({
      ok: true,
      value: 'ASSESSMENT',
    });
  });

  it('rejects skipping a mode', () => {
    expect(decideTransition(live('TEACHER'), { from: 'TEACHER', to: 'EXAMINER' })).toMatchObject({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
    expect(decideTransition(live('TEACHER'), { from: 'TEACHER', to: 'ASSESSMENT' })).toMatchObject({
      ok: false,
      reason: 'INVALID_TRANSITION',
    });
  });

  it('rejects a request made from a mode the attempt is not in', () => {
    expect(
      decideTransition(live('PRACTICE_PARTNER'), { from: 'TEACHER', to: 'PRACTICE_PARTNER' }),
    ).toMatchObject({
      ok: false,
      reason: 'WRONG_MODE',
    });
  });

  it('rejects any change to an attempt that is no longer in progress', () => {
    for (const status of ['DROPPED', 'PASSED', 'FAILED'] as const) {
      expect(
        decideTransition({ status, mode: 'EXAMINER' }, { from: 'EXAMINER', to: 'ASSESSMENT' }),
      ).toMatchObject({
        ok: false,
        reason: 'ATTEMPT_NOT_IN_PROGRESS',
      });
    }
  });
});

describe('decideEvidence', () => {
  it('accepts evidence only in the Examiner mode', () => {
    expect(decideEvidence(live('EXAMINER'), 'EXAMINER')).toEqual({ ok: true, value: null });
    expect(decideEvidence(live('PRACTICE_PARTNER'), 'PRACTICE_PARTNER')).toMatchObject({
      ok: false,
      reason: 'EVIDENCE_NOT_ALLOWED_IN_MODE',
    });
  });

  it('rejects evidence labelled with a different mode than the attempt is in', () => {
    expect(decideEvidence(live('EXAMINER'), 'TEACHER')).toMatchObject({
      ok: false,
      reason: 'WRONG_MODE',
    });
  });
});

describe('decideRecord', () => {
  it('accepts records for the current mode of a live attempt', () => {
    expect(decideRecord(live('TEACHER'), 'TEACHER')).toMatchObject({ ok: true });
    expect(decideRecord({ status: 'DROPPED', mode: 'TEACHER' }, 'TEACHER')).toMatchObject({
      ok: false,
      reason: 'ATTEMPT_NOT_IN_PROGRESS',
    });
  });
});

describe('decideSessionEnd', () => {
  it('drops an attempt that is still in progress', () => {
    expect(decideSessionEnd(live('PRACTICE_PARTNER'))).toBe('DROP');
  });

  it('leaves graded or dropped attempts alone', () => {
    expect(decideSessionEnd({ status: 'PASSED', mode: 'EXAMINER' })).toBe('NO_CHANGE');
    expect(decideSessionEnd({ status: 'DROPPED', mode: 'TEACHER' })).toBe('NO_CHANGE');
  });
});

describe('assess', () => {
  const criteria = [
    { id: 'a', required: true, minConfidence: 0.7 },
    { id: 'b', required: true, minConfidence: 0.7 },
    { id: 'c', required: false, minConfidence: 0.7 },
  ];

  it('passes when every required criterion has confident Examiner evidence', () => {
    const result = assess(criteria, [
      { criterionId: 'a', mode: 'EXAMINER', confidence: 0.9 },
      { criterionId: 'b', mode: 'EXAMINER', confidence: 0.7 },
    ]);
    expect(result.passed).toBe(true);
    expect(result.criteria).toEqual([
      { criterionId: 'a', met: true },
      { criterionId: 'b', met: true },
      { criterionId: 'c', met: false },
    ]);
  });

  it('fails when a required criterion lacks evidence above its threshold', () => {
    const result = assess(criteria, [
      { criterionId: 'a', mode: 'EXAMINER', confidence: 0.9 },
      { criterionId: 'b', mode: 'EXAMINER', confidence: 0.69 },
    ]);
    expect(result.passed).toBe(false);
  });

  it('ignores evidence gathered outside the Examiner mode', () => {
    const result = assess(criteria, [
      { criterionId: 'a', mode: 'PRACTICE_PARTNER', confidence: 1 },
      { criterionId: 'b', mode: 'EXAMINER', confidence: 1 },
    ]);
    expect(result.passed).toBe(false);
  });
});
