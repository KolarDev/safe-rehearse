'use client';

import { useTextStream } from '@livekit/components-react';
import { SESSION_NOTICE_TOPIC, SessionNotice, type AttemptSnapshot } from '@safe-rehearse/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckIcon, RefreshIcon } from '@/components/icons';
import { Notice, Spinner } from '@/components/ui';
import { createLogger } from '@/lib/log';

const log = createLogger('notice');

/** After this long, a reconnect that hasn't finished gets a "what to do" message. */
const SLOW_RECONNECT_MS = 20_000;
/** How long the "reconnected" confirmation stays up. */
const RESTORED_VISIBLE_MS = 8_000;

/**
 * Live health of the AI voice service during a session, as reported by the agent.
 * Must render inside the LiveKit RoomContext.
 */
export function VoiceServiceNotice() {
  const notice = useLatestNotice();

  // The id of the newest notice once its timer has run out.
  const [elapsed, setElapsed] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const ms = notice.kind === 'voice_restored' ? RESTORED_VISIBLE_MS : SLOW_RECONNECT_MS;
    const timer = setTimeout(() => setElapsed(notice.id), ms);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;
  const timedOut = elapsed === notice.id;

  if (notice.kind === 'voice_restored') {
    if (timedOut) return null;
    return (
      <Notice
        tone="success"
        title="Reconnected. You can carry on."
        icon={<CheckIcon width={18} height={18} />}
      >
        If the agent asks, repeat your last answer. Your progress in this attempt is kept.
      </Notice>
    );
  }

  return timedOut ? (
    <Notice tone="warning" title="Still reconnecting to the AI voice service">
      This is taking longer than usual. If the agent doesn&apos;t come back in the next few seconds,
      choose <strong>Leave session</strong> and start a fresh attempt. This attempt won&apos;t be
      graded, so nothing counts against you.
    </Notice>
  ) : (
    <Notice tone="warning" title="Reconnecting to the AI voice service…" icon={<Spinner />}>
      The AI provider had a brief problem. This isn&apos;t something you did. Stay on this page and
      keep your microphone on; the agent will ask you to repeat your last answer.
    </Notice>
  );
}

function useLatestNotice(): SessionNotice | null {
  const { textStreams } = useTextStream(SESSION_NOTICE_TOPIC);

  const notices = useMemo(() => {
    const valid: SessionNotice[] = [];
    for (const stream of textStreams) {
      try {
        const parsed = SessionNotice.safeParse(JSON.parse(stream.text));
        if (parsed.success) valid.push(parsed.data);
      } catch {
        // still arriving
      }
    }
    return valid;
  }, [textStreams]);

  const logged = useRef(new Set<string>());
  useEffect(() => {
    for (const n of notices) {
      if (logged.current.has(n.id)) continue;
      logged.current.add(n.id);
      if (n.kind === 'voice_reconnecting') log.warn('voice service reconnecting');
      else log.info('voice service restored');
    }
  }, [notices]);

  return notices.at(-1) ?? null;
}

/** What went wrong and what to do next, for each way a session can be cut short. */
const ENDED: Partial<Record<string, { title: string; body: string }>> = {
  agent_error: {
    title: 'Your session stopped because the AI voice service failed',
    body: "This was a problem on the AI provider's side, not something you did.",
  },
  network_failure: {
    title: 'Your session stopped because the connection was lost',
    body: 'Check your internet connection before you try again.',
  },
  timeout: {
    title: 'Your session timed out',
    body: 'The session ran for too long without finishing.',
  },
};

/**
 * Shown after a session ends without a result, so the learner knows why and what
 * to do. Leaving on purpose (or being superseded by a retry) needs no explanation.
 */
export function SessionEndedNotice({
  attempt,
  onDismiss,
}: {
  attempt: AttemptSnapshot;
  onDismiss: () => void;
}) {
  if (attempt.status !== 'DROPPED') return null;
  const ended = ENDED[attempt.endReason ?? ''];
  if (!ended) return null;
  return (
    <Notice
      tone="danger"
      title={ended.title}
      icon={<RefreshIcon width={18} height={18} />}
      onDismiss={onDismiss}
    >
      {ended.body} This attempt hasn&apos;t been graded and won&apos;t count against you. To carry
      on, choose <strong>Retry with a fresh attempt</strong> below. You&apos;ll start again from the
      Teach step.
    </Notice>
  );
}
