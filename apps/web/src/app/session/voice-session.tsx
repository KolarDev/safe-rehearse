'use client';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useTranscriptions,
  useVoiceAssistant,
} from '@livekit/components-react';
import type { VoiceSessionResponse } from '@safe-rehearse/types';
import { useEffect } from 'react';
import { api } from '@/lib/api';

interface Props {
  session: VoiceSessionResponse;
  attemptId: string;
  onLeave: () => void;
}

export function VoiceSession({ session, attemptId, onLeave }: Props) {
  // Closing the tab mid-session drops the attempt (backend rule: dropped attempts are not graded).
  useEffect(() => {
    const handler = () => api.abandonOnUnload(attemptId);
    window.addEventListener('pagehide', handler);
    return () => window.removeEventListener('pagehide', handler);
  }, [attemptId]);

  return (
    <LiveKitRoom
      serverUrl={session.serverUrl}
      token={session.participantToken}
      connect
      audio
      video={false}
      onDisconnected={onLeave}
      className="flex flex-col gap-4"
    >
      <RoomAudioRenderer />
      <SessionBody onLeave={onLeave} />
    </LiveKitRoom>
  );
}

function SessionBody({ onLeave }: { onLeave: () => void }) {
  const { state } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
  const transcriptions = useTranscriptions();

  return (
    <section className="flex flex-col gap-3 rounded border p-4">
      <div className="flex items-center justify-between text-sm">
        <span>
          Agent: <strong>{state}</strong>
        </span>
        <button className="rounded border px-3 py-1" onClick={onLeave}>
          Leave
        </button>
      </div>
      <ol className="flex max-h-96 flex-col gap-2 overflow-y-auto text-sm">
        {transcriptions.map((t) => (
          <li key={t.streamInfo.id}>
            <strong>
              {t.participantInfo.identity === localParticipant.identity ? 'You' : 'Agent'}:
            </strong>{' '}
            {t.text}
          </li>
        ))}
      </ol>
    </section>
  );
}
