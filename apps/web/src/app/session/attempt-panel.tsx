import type { AttemptSnapshot } from '@safe-rehearse/types';
import { AlertIcon, CheckIcon, XIcon } from '@/components/icons';
import { Badge, Card, cx } from '@/components/ui';

const STEPS = [
  { mode: 'TEACHER', label: 'Teach', hint: 'Learn the material' },
  { mode: 'PRACTICE_PARTNER', label: 'Practise', hint: 'Rehearse the situation' },
  { mode: 'EXAMINER', label: 'Assess', hint: 'Assessed role-play' },
] as const;

type StepState = 'done' | 'current' | 'stopped' | 'upcoming';

export function AttemptPanel({ attempt }: { attempt: AttemptSnapshot | null }) {
  if (!attempt) {
    return (
      <Card className="p-6">
        <h2 className="text-sm font-semibold">Attempt</h2>
        <p className="mt-2 text-sm text-muted">
          No attempt yet. Each time you start a stage, the backend creates a fresh attempt and
          tracks it here.
        </p>
        <Stepper attempt={null} />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Attempt</h2>
          <p className="mt-1 font-mono text-xs text-muted">{attempt.id}</p>
        </div>
        <StatusBadge status={attempt.status} />
      </div>

      <Stepper attempt={attempt} />

      <dl className="mt-6 grid grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <dt className="text-muted">Started</dt>
          <dd className="mt-0.5 font-medium">{formatTime(attempt.startedAt)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 px-3 py-2">
          <dt className="text-muted">Ended</dt>
          <dd className="mt-0.5 font-medium">
            {attempt.endedAt ? formatTime(attempt.endedAt) : '—'}
          </dd>
        </div>
      </dl>

      {attempt.status === 'DROPPED' && (
        <div className="mt-5 flex gap-3 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertIcon className="mt-0.5 shrink-0" width={18} height={18} />
          <div>
            <p className="font-semibold">{dropReasonLabel(attempt.endReason)}</p>
            <p className="mt-1">
              This attempt <strong>will not be graded</strong>. Retrying starts a completely fresh
              attempt.
            </p>
          </div>
        </div>
      )}

      {attempt.result && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Assessment criteria
          </h3>
          <ul className="mt-3 space-y-2">
            {attempt.result.criteria.map((c) => (
              <li
                key={c.criterionId}
                className={cx(
                  'flex gap-3 rounded-xl px-3 py-2.5 text-sm',
                  c.met ? 'bg-success-soft' : 'bg-danger-soft',
                )}
              >
                <span
                  className={cx(
                    'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-white',
                    c.met ? 'bg-success' : 'bg-danger',
                  )}
                >
                  {c.met ? (
                    <CheckIcon width={12} height={12} strokeWidth={3} />
                  ) : (
                    <XIcon width={12} height={12} strokeWidth={3} />
                  )}
                </span>
                <span className="text-foreground">{c.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function StatusBadge({ status }: { status: AttemptSnapshot['status'] }) {
  switch (status) {
    case 'IN_PROGRESS':
      return (
        <Badge tone="brand" pulse>
          In progress
        </Badge>
      );
    case 'PASSED':
      return <Badge tone="success">Passed</Badge>;
    case 'FAILED':
      return <Badge tone="danger">Not yet passed</Badge>;
    case 'DROPPED':
      return <Badge tone="warning">Dropped</Badge>;
  }
}

function Stepper({ attempt }: { attempt: AttemptSnapshot | null }) {
  const currentIndex = attempt ? STEPS.findIndex((s) => s.mode === attempt.mode) : -1;
  const graded = attempt?.status === 'PASSED' || attempt?.status === 'FAILED';

  const stateOf = (index: number): StepState => {
    if (!attempt) return 'upcoming';
    if (graded || index < currentIndex) return 'done';
    if (index === currentIndex) return attempt.status === 'DROPPED' ? 'stopped' : 'current';
    return 'upcoming';
  };

  return (
    <ol className="mt-6 space-y-1">
      {STEPS.map((step, index) => (
        <StepRow key={step.mode} label={step.label} hint={step.hint} state={stateOf(index)} />
      ))}
      <StepRow
        label="Result"
        hint={
          attempt?.status === 'PASSED'
            ? 'Passed'
            : attempt?.status === 'FAILED'
              ? 'Not yet passed'
              : 'Graded by SafeRehearse'
        }
        state={graded ? (attempt?.status === 'PASSED' ? 'done' : 'stopped') : 'upcoming'}
        last
      />
    </ol>
  );
}

function StepRow({
  label,
  hint,
  state,
  last = false,
}: {
  label: string;
  hint: string;
  state: StepState;
  last?: boolean;
}) {
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={cx(
            'flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold transition',
            state === 'done' && 'border-brand bg-brand text-brand-contrast',
            state === 'current' && 'border-brand bg-brand-soft text-brand',
            state === 'stopped' && 'border-danger bg-danger-soft text-danger',
            state === 'upcoming' && 'border-line bg-surface text-muted',
          )}
        >
          {state === 'done' ? (
            <CheckIcon width={14} height={14} strokeWidth={3} />
          ) : state === 'stopped' ? (
            <XIcon width={14} height={14} strokeWidth={3} />
          ) : state === 'current' ? (
            <span className="size-2 animate-pulse rounded-full bg-brand" />
          ) : null}
        </span>
        {!last && (
          <span
            className={cx(
              'my-1 w-0.5 flex-1 rounded-full',
              state === 'done' ? 'bg-brand' : 'bg-line',
            )}
          />
        )}
      </div>
      <div className={cx('pb-4', last && 'pb-0')}>
        <p className={cx('text-sm font-semibold', state === 'upcoming' && 'text-muted')}>{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
    </li>
  );
}

/** Plain-language reasons for the backend's endReason codes. */
function dropReasonLabel(reason: string | null): string {
  switch (reason) {
    case 'participant_left':
      return 'You left the session.';
    case 'network_failure':
      return 'The connection was lost.';
    case 'agent_error':
      return 'The AI voice service stopped unexpectedly.';
    case 'timeout':
      return 'The session timed out.';
    case 'superseded':
      return 'Replaced by a newer attempt.';
    default:
      return 'The session was interrupted.';
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
