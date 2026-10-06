import type { AttemptSnapshot } from '@safe-rehearse/types';
import { CheckIcon, RefreshIcon } from '@/components/icons';
import { Card, cx } from '@/components/ui';
import { CriteriaResults } from './attempt-panel';

/**
 * The learner's result, front and centre, as soon as the backend has graded the
 * attempt. The grade and per-criterion verdicts come only from the backend.
 */
export function ResultCard({ attempt }: { attempt: AttemptSnapshot }) {
  if (!attempt.result || (attempt.status !== 'PASSED' && attempt.status !== 'FAILED')) return null;
  const passed = attempt.status === 'PASSED';
  const { criteria } = attempt.result;
  const met = criteria.filter((c) => c.met).length;

  return (
    <Card className="overflow-hidden motion-safe:animate-[lesson-in_260ms_ease-out]">
      <div
        className={cx(
          'flex items-center gap-4 px-6 py-5',
          passed ? 'bg-success-soft' : 'bg-warning-soft',
        )}
      >
        <span
          className={cx(
            'flex size-11 shrink-0 items-center justify-center rounded-full text-white',
            passed ? 'bg-success' : 'bg-warning',
          )}
        >
          {passed ? (
            <CheckIcon width={22} height={22} strokeWidth={3} />
          ) : (
            <RefreshIcon width={20} height={20} strokeWidth={2.5} />
          )}
        </span>
        <div role="status">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">
            Assessment result
          </p>
          <h2 className="text-xl font-semibold tracking-tight">
            {passed ? 'Passed' : 'Not yet passed'}
          </h2>
          <p className="text-sm text-muted">
            You met {met} of {criteria.length} criteria.
          </p>
        </div>
      </div>

      <div className="px-6 py-5">
        <CriteriaResults criteria={criteria} />
        <p className="mt-4 text-sm text-muted">
          {passed
            ? 'Well done. You can rehearse this stage again any time to keep it fresh.'
            : 'Look at the criteria you didn’t meet, then try again below. Each retry starts a fresh attempt from the Teach step.'}
        </p>
      </div>
    </Card>
  );
}
