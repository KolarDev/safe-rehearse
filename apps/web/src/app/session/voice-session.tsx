'use client';

import {
  RoomAudioRenderer,
  RoomContext,
  StartAudio,
  useConnectionState,
  useLocalParticipant,
  useTranscriptions,
  useVoiceAssistant,
} from '@livekit/components-react';
import type { VoiceSessionResponse } from '@safe-rehearse/types';
import { Room } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface Props {
  session: VoiceSessionResponse;
  attemptId: string;
  onLeave: () => void;
}

export function VoiceSession({ session, attemptId, onLeave }: Props) {
  const [room] = useState(() => new Room());
  const [error, setError] = useState<string | null>(null);
  const pendingDisconnect = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Connect exactly once per mounted session. React StrictMode mounts, unmounts and
  // remounts in development; a naive connect/disconnect would join twice with the same
  // identity, and the agent would read the first disconnect as the learner leaving.
  useEffect(() => {
    if (pendingDisconnect.current) {
      clearTimeout(pendingDisconnect.current);
      pendingDisconnect.current = null;
    } else {
      room
        .connect(session.serverUrl, session.participantToken)
        .then(() => room.localParticipant.setMicrophoneEnabled(true))
        .catch((e: Error) => setError(e.message));
    }
    return () => {
      pendingDisconnect.current = setTimeout(() => void room.disconnect(), 0);
    };
  }, [room, session.serverUrl, session.participantToken]);

  // Closing the tab mid-session drops the attempt (backend rule: dropped attempts are not graded).
  useEffect(() => {
    const handler = () => api.abandonOnUnload(attemptId);
    window.addEventListener('pagehide', handler);
    return () => window.removeEventListener('pagehide', handler);
  }, [attemptId]);

  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer />
      <StartAudio
        label="Click to enable agent audio"
        className="rounded border px-3 py-1 text-sm"
      />
      {error && <p className="text-sm text-red-600">Could not connect: {error}</p>}
      <SessionBody onLeave={onLeave} />
    </RoomContext.Provider>
  );
}

function SessionBody({ onLeave }: { onLeave: () => void }) {
  const connection = useConnectionState();
  const { state } = useVoiceAssistant();
  const { localParticipant } = useLocalParticipant();
  const transcriptions = useTranscriptions();

  return (
    <section className="flex flex-col gap-3 rounded border p-4">
      <div className="flex items-center justify-between text-sm">
        <span>
          Connection: <strong>{connection}</strong> · Agent: <strong>{state}</strong>
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
