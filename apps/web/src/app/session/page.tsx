'use client';

import type { AttemptSnapshot, StageSummary, VoiceSessionResponse } from '@safe-rehearse/types';
import { useEffect, useRef, useState } from 'react';
import { ArrowRightIcon, MicIcon, RefreshIcon } from '@/components/icons';
import { Alert, Button, Card, cx, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { createLogger } from '@/lib/log';
import { AttemptPanel } from './attempt-panel';
import { VoiceSession } from './voice-session';

const log = createLogger('session');

/**
 * Development rehearsal page: start a stage attempt, talk to the agent, and watch
 * the backend's view of the attempt.
 */
export default function SessionPage() {
  const [stages, setStages] = useState<StageSummary[] | null>(null);
  const [stageId, setStageId] = useState('');
  const [learnerRef, setLearnerRef] = useState('dev-learner');
  const [attempt, setAttempt] = useState<AttemptSnapshot | null>(null);
  const [voice, setVoice] = useState<VoiceSessionResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listStages()
      .then((list) => {
        log.info(`${list.length} stage(s) available`);
        if (list.length === 0) log.warn('no stages found; run `pnpm db:seed`');
        setStages(list);
        setStageId((current) => current || list[0]?.id || '');
      })
      .catch((e: Error) => {
        setStages([]);
        setError(e.message);
      });
  }, []);

  // The backend is the source of truth for attempt state; poll it while the session runs.
  useEffect(() => {
    if (!attempt || attempt.status !== 'IN_PROGRESS') return;
    const timer = setInterval(() => {
      api
        .getAttempt(attempt.id)
        .then(setAttempt)
        .catch((e: Error) => log.warn('could not refresh attempt state', e.message));
    }, 2000);
    return () => clearInterval(timer);
  }, [attempt]);

  // Log every backend-reported change of mode or status.
  const previous = useRef<AttemptSnapshot | null>(null);
  useEffect(() => {
    const before = previous.current;
    if (attempt && before?.id === attempt.id) {
      if (before.mode !== attempt.mode) log.info(`mode: ${before.mode} → ${attempt.mode}`);
      if (before.status !== attempt.status) {
        const line = `status: ${before.status} → ${attempt.status}`;
        if (attempt.status === 'DROPPED') log.warn(line);
        else log.info(line);
      }
    }
    previous.current = attempt;
  }, [attempt]);

  async function start() {
    setError(null);
    setStarting(true);
    try {
      log.info(`starting stage ${stageId} as "${learnerRef}"`);
      const created = await api.startAttempt({ stageId, learnerRef });
      setAttempt(created);
      setVoice(await api.startVoiceSession(created.id));
    } catch (e) {
      log.error('could not start the session', e);
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function leave() {
    log.info('learner left the session');
    setVoice(null);
    if (attempt?.status === 'IN_PROGRESS') {
      try {
        setAttempt(await api.abandon(attempt.id));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }

  const inSession = voice !== null && attempt?.status === 'IN_PROGRESS';

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-wider text-brand uppercase">
          Rehearsal studio
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {inSession ? 'Session in progress' : 'Start a voice rehearsal'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          {inSession
            ? 'Speak naturally. The agent teaches, then practises with you, then assesses you. SafeRehearse decides the result.'
            : 'Pick a stage and start. Your browser will ask for microphone access.'}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          {error && <Alert onDismiss={() => setError(null)}>{error}</Alert>}

          {inSession && voice && attempt ? (
            <VoiceSession session={voice} attempt={attempt} onLeave={leave} />
          ) : (
            <SetupCard
              stages={stages}
              stageId={stageId}
              onStageChange={setStageId}
              learnerRef={learnerRef}
              onLearnerRefChange={setLearnerRef}
              starting={starting}
              isRetry={attempt !== null}
              onStart={start}
            />
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <AttemptPanel attempt={attempt} />
        </aside>
      </div>
    </main>
  );
}

function SetupCard(props: {
  stages: StageSummary[] | null;
  stageId: string;
  onStageChange: (id: string) => void;
  learnerRef: string;
  onLearnerRefChange: (value: string) => void;
  starting: boolean;
  isRetry: boolean;
  onStart: () => void;
}) {
  const { stages, stageId, learnerRef, starting, isRetry } = props;

  return (
    <Card className="p-6 sm:p-8">
      <h2 className="text-base font-semibold">Choose a stage</h2>
      <p className="mt-1 text-sm text-muted">
        Each stage runs Teach → Practise → Assess in one voice session.
      </p>

      <div className="mt-5 space-y-3">
        {stages === null ? (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-line p-5 text-sm text-muted">
            <Spinner /> Loading stages…
          </div>
        ) : stages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-5 text-sm text-muted">
            No stages yet. Run <code className="font-mono text-foreground">pnpm db:seed</code> to
            add the sample stage.
          </div>
        ) : (
          stages.map((s) => {
            const selected = s.id === stageId;
            return (
              <label
                key={s.id}
                className={cx(
                  'flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition',
                  selected
                    ? 'border-brand bg-brand-soft/50 ring-1 ring-brand'
                    : 'border-line hover:border-muted/40 hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  name="stage"
                  value={s.id}
                  checked={selected}
                  onChange={() => props.onStageChange(s.id)}
                  className="mt-1 accent-[var(--brand)]"
                />
                <span className="flex-1">
                  <span className="block text-xs text-muted">{s.scenario.title}</span>
                  <span className="mt-0.5 block text-sm font-semibold">
                    Stage {s.position}: {s.title}
                  </span>
                </span>
              </label>
            );
          })
        )}
      </div>

      <div className="mt-6">
        <label htmlFor="learnerRef" className="text-sm font-medium">
          Learner reference
        </label>
        <input
          id="learnerRef"
          value={learnerRef}
          onChange={(e) => props.onLearnerRefChange(e.target.value)}
          className="mt-1.5 block w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm outline-none transition placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/20"
          placeholder="e.g. dev-learner"
        />
        <p className="mt-1.5 text-xs text-muted">Temporary identifier until sign-in exists.</p>
      </div>

      <div className="mt-8 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-muted">
          <MicIcon width={14} height={14} /> Uses your microphone
        </p>
        <Button
          onClick={props.onStart}
          disabled={!stageId || !learnerRef.trim() || starting}
          className="sm:min-w-48"
        >
          {starting ? (
            <>
              <Spinner /> Starting…
            </>
          ) : isRetry ? (
            <>
              <RefreshIcon width={16} height={16} /> Retry with a fresh attempt
            </>
          ) : (
            <>
              Start session <ArrowRightIcon width={16} height={16} />
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}
