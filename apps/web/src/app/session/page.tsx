'use client';

import type { AttemptSnapshot, StageSummary, VoiceSessionResponse } from '@safe-rehearse/types';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { VoiceSession } from './voice-session';

/**
 * Minimal development page: start a stage attempt, talk to the agent, see the
 * backend's view of the attempt. Not product UI.
 */
export default function SessionPage() {
  const [stages, setStages] = useState<StageSummary[]>([]);
  const [stageId, setStageId] = useState('');
  const [learnerRef, setLearnerRef] = useState('dev-learner');
  const [attempt, setAttempt] = useState<AttemptSnapshot | null>(null);
  const [voice, setVoice] = useState<VoiceSessionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listStages()
      .then((list) => {
        setStages(list);
        setStageId((current) => current || list[0]?.id || '');
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // The backend is the source of truth for attempt state; poll it while the session runs.
  useEffect(() => {
    if (!attempt || attempt.status !== 'IN_PROGRESS') return;
    const timer = setInterval(() => {
      api
        .getAttempt(attempt.id)
        .then(setAttempt)
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [attempt]);

  async function start() {
    setError(null);
    try {
      const created = await api.startAttempt({ stageId, learnerRef });
      setAttempt(created);
      setVoice(await api.startVoiceSession(created.id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function leave() {
    setVoice(null);
    if (attempt?.status === 'IN_PROGRESS') {
      setAttempt(await api.abandon(attempt.id));
    }
  }

  const inSession = voice !== null && attempt?.status === 'IN_PROGRESS';

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">SafeRehearse: dev session</h1>

      {!inSession && (
        <section className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Stage
            <select
              className="rounded border p-2"
              value={stageId}
              onChange={(e) => setStageId(e.target.value)}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.scenario.title} / {s.position}. {s.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Learner reference (temporary, until auth)
            <input
              className="rounded border p-2"
              value={learnerRef}
              onChange={(e) => setLearnerRef(e.target.value)}
            />
          </label>
          <button
            className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
            disabled={!stageId || !learnerRef.trim()}
            onClick={start}
          >
            {attempt ? 'Retry stage (new attempt)' : 'Start stage'}
          </button>
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {attempt && <AttemptPanel attempt={attempt} />}

      {inSession && voice && attempt && (
        <VoiceSession session={voice} attemptId={attempt.id} onLeave={leave} />
      )}
    </main>
  );
}

function AttemptPanel({ attempt }: { attempt: AttemptSnapshot }) {
  return (
    <section className="rounded border p-4 text-sm">
      <p>
        Attempt <code>{attempt.id}</code>
      </p>
      <p>
        Status: <strong>{attempt.status}</strong> · Mode: <strong>{attempt.mode}</strong>
      </p>
      {attempt.status === 'DROPPED' && (
        <p className="mt-2">This attempt was dropped and will not be graded.</p>
      )}
      {attempt.result && (
        <ul className="mt-2 list-disc pl-5">
          {attempt.result.criteria.map((c) => (
            <li key={c.criterionId}>
              {c.met ? '✓' : '✗'} {c.description}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
