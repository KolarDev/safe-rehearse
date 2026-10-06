'use client';

import { useTextStream } from '@livekit/components-react';
import {
  LESSON_TOPIC,
  LessonMessage,
  type AttemptSnapshot,
  type LessonTextVariant,
  type ShowScenarioEvent,
  type ShowTextEvent,
} from '@safe-rehearse/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  UsersIcon,
} from '@/components/icons';
import { cx } from '@/components/ui';
import { createLogger } from '@/lib/log';

const log = createLogger('lesson');

/**
 * The visual board beside the conversation. The agent sends lesson events on
 * LESSON_TOPIC; this component validates them and renders each kind with a
 * fixed, SafeRehearse-owned component. Anything it doesn't recognise is dropped.
 */
export function LessonBoard({ mode }: { mode: AttemptSnapshot['mode'] }) {
  const messages = useLessonMessages();
  const visible = useMemo(() => messages.filter((m) => m.mode === mode), [messages, mode]);

  // The board follows the newest card. A learner can look back, but a new card
  // (or a new mode) brings them forward again.
  const count = visible.length;
  const [lookingBack, setLookingBack] = useState<{ index: number; count: number } | null>(null);
  const pinned = lookingBack && lookingBack.count === count ? lookingBack.index : null;
  const showCard = (i: number) => setLookingBack(i >= count - 1 ? null : { index: i, count });

  // Visuals are teaching-only for now; keep the board out of the way elsewhere.
  if (count === 0 && mode !== 'TEACHER') return null;

  const index = pinned ?? count - 1;
  const current = visible[index];

  return (
    <section aria-label="Lesson board" className="border-b border-line bg-surface-2/60 px-6 py-5">
      <div aria-live="polite" aria-atomic="true">
        {current ? (
          <div key={current.id} className="motion-safe:animate-[lesson-in_260ms_ease-out]">
            {current.event.kind === 'show_text' ? (
              <TextCard event={current.event} />
            ) : (
              <ScenarioCard event={current.event} />
            )}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            Key points and examples will appear here as the lesson goes on.
          </p>
        )}
      </div>

      {count > 1 && (
        <nav className="mt-3 flex items-center justify-end gap-1 text-xs text-muted">
          {pinned !== null && (
            <button
              onClick={() => showCard(count - 1)}
              className="mr-2 rounded-lg px-2 py-1 font-semibold text-brand hover:bg-brand-soft"
            >
              Back to latest
            </button>
          )}
          <button
            onClick={() => showCard(index - 1)}
            disabled={index === 0}
            aria-label="Previous card"
            className="rounded-lg p-1 hover:bg-surface hover:text-foreground disabled:opacity-40"
          >
            <ChevronLeftIcon width={16} height={16} />
          </button>
          <span className="tabular-nums">
            {index + 1} of {count}
          </span>
          <button
            onClick={() => showCard(index + 1)}
            disabled={index === count - 1}
            aria-label="Next card"
            className="rounded-lg p-1 hover:bg-surface hover:text-foreground disabled:opacity-40"
          >
            <ChevronRightIcon width={16} height={16} />
          </button>
        </nav>
      )}
    </section>
  );
}

/** Lesson messages received so far, validated and de-duplicated, in arrival order. */
function useLessonMessages(): LessonMessage[] {
  const { textStreams } = useTextStream(LESSON_TOPIC);

  const { messages, rejected } = useMemo(() => {
    const seen = new Set<string>();
    const messages: LessonMessage[] = [];
    const rejected: { streamId: string; issues: unknown }[] = [];
    for (const stream of textStreams) {
      let raw: unknown;
      try {
        raw = JSON.parse(stream.text);
      } catch {
        continue; // still arriving
      }
      const parsed = LessonMessage.safeParse(raw);
      if (!parsed.success) {
        rejected.push({ streamId: stream.streamInfo.id, issues: parsed.error.issues });
      } else if (!seen.has(parsed.data.id)) {
        seen.add(parsed.data.id);
        messages.push(parsed.data);
      }
    }
    return { messages, rejected };
  }, [textStreams]);

  // Log each event once, as it arrives.
  const logged = useRef(new Set<string>());
  useEffect(() => {
    for (const m of messages) {
      if (logged.current.has(m.id)) continue;
      logged.current.add(m.id);
      log.info(`showing ${m.event.kind} (${m.mode}): "${m.event.title}"`);
    }
    for (const r of rejected) {
      if (logged.current.has(r.streamId)) continue;
      logged.current.add(r.streamId);
      log.warn('ignored an invalid lesson event', r.issues);
    }
  }, [messages, rejected]);

  return messages;
}

const TEXT_VARIANT: Record<
  LessonTextVariant,
  { label: string; card: string; accent: string; bullet: string }
> = {
  info: {
    label: 'Explainer',
    card: 'border-line bg-surface',
    accent: 'text-muted',
    bullet: 'bg-muted/50',
  },
  key_point: {
    label: 'Key point',
    card: 'border-brand/30 bg-brand-soft/60',
    accent: 'text-brand',
    bullet: 'bg-brand',
  },
  warning: {
    label: 'Take care',
    card: 'border-warning/30 bg-warning-soft',
    accent: 'text-warning',
    bullet: 'bg-warning',
  },
};

function TextCard({ event }: { event: ShowTextEvent }) {
  const style = TEXT_VARIANT[event.variant];
  return (
    <article className={cx('rounded-2xl border p-5', style.card)}>
      <p
        className={cx(
          'flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase',
          style.accent,
        )}
      >
        {event.variant === 'warning' && <AlertIcon width={13} height={13} />}
        {style.label}
      </p>
      <h3 className="mt-1 text-lg font-semibold tracking-tight">{event.title}</h3>
      <ul className="mt-3 space-y-2">
        {event.points.map((point, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed">
            <span className={cx('mt-2 size-1.5 shrink-0 rounded-full', style.bullet)} />
            {point}
          </li>
        ))}
      </ul>
    </article>
  );
}

function ScenarioCard({ event }: { event: ShowScenarioEvent }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line bg-gradient-to-r from-brand-soft/70 to-surface px-5 py-4">
        <p className="text-[11px] font-semibold tracking-wider text-brand uppercase">
          Example scenario
        </p>
        <h3 className="mt-1 text-lg font-semibold tracking-tight">{event.title}</h3>
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted">
          <MapPinIcon width={14} height={14} className="mt-px shrink-0" />
          {event.setting}
        </p>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm leading-relaxed">{event.situation}</p>
        {event.people.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-2">
            {event.people.map((person, i) => (
              <li
                key={i}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-xs font-medium"
              >
                <UsersIcon width={13} height={13} className="text-muted" />
                {person}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}
