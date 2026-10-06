'use client';

import {
  BarVisualizer,
  RoomAudioRenderer,
  RoomContext,
  StartAudio,
  useConnectionState,
  useLocalParticipant,
  useTranscriptions,
  useVoiceAssistant,
} from '@livekit/components-react';
import type { AttemptSnapshot, VoiceSessionResponse } from '@safe-rehearse/types';
import { ConnectionState, DisconnectReason, Room, RoomEvent } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { MicIcon, MicOffIcon, PhoneOffIcon } from '@/components/icons';
import { Alert, Badge, Button, Card, cx } from '@/components/ui';
import { api } from '@/lib/api';
import { createLogger } from '@/lib/log';
import { LessonBoard } from './lesson-board';
import { VoiceServiceNotice } from './session-notices';

const log = createLogger('room');
const AGENT_JOIN_TIMEOUT_MS = 30_000;

const MODE_LABEL: Record<AttemptSnapshot['mode'], string> = {
  TEACHER: 'Teacher',
  PRACTICE_PARTNER: 'Practice Partner',
  EXAMINER: 'Examiner',
};

/** Leave this long after the agent stops speaking once the attempt is graded. */
const GOODBYE_GRACE_MS = 2_500;
/** Never keep a finished session open longer than this. */
const GOODBYE_MAX_MS = 25_000;

interface Props {
  session: VoiceSessionResponse;
  attempt: AttemptSnapshot;
  /** The attempt has been graded; the session only remains for the agent's goodbye. */
  finished: boolean;
  onLeave: () => void;
}

export function VoiceSession({ session, attempt, finished, onLeave }: Props) {
  const [room] = useState(() => new Room());
  const [error, setError] = useState<string | null>(null);
  const pendingDisconnect = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Log every room event that matters for diagnosing a session.
  useEffect(() => {
    const isAgent = (identity: string) => !identity.startsWith('learner-');
    const onConnected = () => log.info(`connected to room ${room.name}`);
    const onDisconnected = (reason?: DisconnectReason) =>
      log.warn(
        `disconnected from room: ${reason === undefined ? 'unknown' : DisconnectReason[reason]}`,
      );
    const onReconnecting = () => log.warn('connection lost; reconnecting…');
    const onReconnected = () => log.info('reconnected');
    const onState = (state: ConnectionState) => log.debug(`connection state: ${state}`);
    const onJoined = (p: { identity: string }) =>
      log.info(`${isAgent(p.identity) ? 'agent' : 'participant'} joined: ${p.identity}`);
    const onLeft = (p: { identity: string }) =>
      (isAgent(p.identity) ? log.warn : log.info)(
        `${isAgent(p.identity) ? 'agent' : 'participant'} left: ${p.identity}`,
      );
    const onTrack = (track: { kind: string }, _pub: unknown, p: { identity: string }) =>
      log.info(`subscribed to ${track.kind} from ${p.identity}`);
    const onDeviceError = (e: Error) => log.error('microphone/device error', e);
    const onPlayback = () => log.info(`audio playback allowed: ${room.canPlaybackAudio}`);

    room
      .on(RoomEvent.Connected, onConnected)
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.Reconnecting, onReconnecting)
      .on(RoomEvent.Reconnected, onReconnected)
      .on(RoomEvent.ConnectionStateChanged, onState)
      .on(RoomEvent.ParticipantConnected, onJoined)
      .on(RoomEvent.ParticipantDisconnected, onLeft)
      .on(RoomEvent.TrackSubscribed, onTrack)
      .on(RoomEvent.MediaDevicesError, onDeviceError)
      .on(RoomEvent.AudioPlaybackStatusChanged, onPlayback);
    return () => {
      room
        .off(RoomEvent.Connected, onConnected)
        .off(RoomEvent.Disconnected, onDisconnected)
        .off(RoomEvent.Reconnecting, onReconnecting)
        .off(RoomEvent.Reconnected, onReconnected)
        .off(RoomEvent.ConnectionStateChanged, onState)
        .off(RoomEvent.ParticipantConnected, onJoined)
        .off(RoomEvent.ParticipantDisconnected, onLeft)
        .off(RoomEvent.TrackSubscribed, onTrack)
        .off(RoomEvent.MediaDevicesError, onDeviceError)
        .off(RoomEvent.AudioPlaybackStatusChanged, onPlayback);
    };
  }, [room]);

  // Connect exactly once per mounted session. React StrictMode mounts, unmounts and
  // remounts in development; a naive connect/disconnect would join twice with the same
  // identity, and the agent would read the first disconnect as the learner leaving.
  useEffect(() => {
    if (pendingDisconnect.current) {
      clearTimeout(pendingDisconnect.current);
      pendingDisconnect.current = null;
    } else {
      log.info(`connecting to ${session.serverUrl} (room ${session.roomName})`);
      room
        .connect(session.serverUrl, session.participantToken)
        .then(() => room.localParticipant.setMicrophoneEnabled(true))
        .then(() => log.info('microphone enabled'))
        .catch((e: Error) => {
          log.error('could not connect or enable the microphone', e);
          setError(e.message);
        });
    }
    return () => {
      pendingDisconnect.current = setTimeout(() => {
        log.info('leaving room');
        void room.disconnect();
      }, 0);
    };
  }, [room, session.serverUrl, session.roomName, session.participantToken]);

  // Closing the tab mid-session drops the attempt (backend rule: dropped attempts are not graded).
  useEffect(() => {
    const handler = () => api.abandonOnUnload(attempt.id);
    window.addEventListener('pagehide', handler);
    return () => window.removeEventListener('pagehide', handler);
  }, [attempt.id]);

  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer />
      {finished && <LeaveAfterGoodbye onLeave={onLeave} />}
      <Card className="flex flex-col overflow-hidden">
        <AgentStage mode={attempt.mode} onLeave={onLeave} />
        {error && (
          <div className="px-6 pb-4">
            <Alert>Could not connect: {error}</Alert>
          </div>
        )}
        <div className="px-6 empty:hidden [&:not(:empty)]:py-4">
          <VoiceServiceNotice />
        </div>
        <LessonBoard mode={attempt.mode} />
        <Transcript />
      </Card>
    </RoomContext.Provider>
  );
}

/**
 * Once graded, let the agent finish saying goodbye, then leave the room. The
 * grade can land before, during or after the goodbye, so leave when the agent has
 * been quiet for a moment, or after a hard cap.
 */
function LeaveAfterGoodbye({ onLeave }: { onLeave: () => void }) {
  const { state } = useVoiceAssistant();
  const leave = useRef(onLeave);
  useEffect(() => {
    leave.current = onLeave;
  });

  useEffect(() => {
    log.info('attempt graded; leaving once the agent has said goodbye');
    const timer = setTimeout(() => leave.current(), GOODBYE_MAX_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (state === 'speaking') return;
    const timer = setTimeout(() => leave.current(), GOODBYE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  return null;
}

const AGENT_STATE: Record<string, { label: string; tone: 'brand' | 'neutral' | 'warning' }> = {
  disconnected: { label: 'Waiting for the agent…', tone: 'neutral' },
  connecting: { label: 'Agent connecting…', tone: 'neutral' },
  'pre-connect-buffering': { label: 'Agent connecting…', tone: 'neutral' },
  initializing: { label: 'Agent getting ready…', tone: 'neutral' },
  listening: { label: 'Listening', tone: 'brand' },
  thinking: { label: 'Thinking…', tone: 'warning' },
  speaking: { label: 'Speaking', tone: 'brand' },
  failed: { label: 'Agent failed', tone: 'warning' },
};

function AgentStage({ mode, onLeave }: { mode: AttemptSnapshot['mode']; onLeave: () => void }) {
  const connection = useConnectionState();
  const { state, audioTrack, agent: agentParticipant } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const agent = AGENT_STATE[state] ?? { label: state, tone: 'neutral' as const };

  // LiveKit dispatches the agent once, when the room is created. If that fails the
  // learner would otherwise wait forever, so say so after a reasonable delay.
  const [joinTimedOut, setJoinTimedOut] = useState(false);
  const waitingForAgent = connection === ConnectionState.Connected && !agentParticipant;
  useEffect(() => {
    if (!waitingForAgent) return;
    const timer = setTimeout(() => {
      log.error(
        `no agent joined within ${AGENT_JOIN_TIMEOUT_MS / 1000}s; check the voice-agent terminal for "job received"`,
      );
      setJoinTimedOut(true);
    }, AGENT_JOIN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waitingForAgent]);
  const agentMissing = joinTimedOut && waitingForAgent;

  const lastState = useRef(state);
  useEffect(() => {
    if (lastState.current !== state) {
      log.debug(`agent state: ${lastState.current} → ${state}`);
      lastState.current = state;
    }
  }, [state]);

  return (
    <div className="border-b border-line bg-gradient-to-b from-brand-soft/60 to-surface px-6 pt-6 pb-5">
      <div className="flex items-center justify-between gap-3">
        <Badge tone="brand">{MODE_LABEL[mode]}</Badge>
        <span className="text-xs text-muted">
          {connection === ConnectionState.Connected ? 'Connected' : capitalise(connection)}
        </span>
      </div>

      <div className="mx-auto mt-6 flex h-28 w-48 items-center justify-center">
        <BarVisualizer state={state} barCount={5} track={audioTrack} options={{ minHeight: 14 }} />
      </div>
      {agentMissing && (
        <div className="mx-auto mt-4 max-w-md">
          <Alert>
            The voice agent hasn&apos;t joined. Make sure the voice-agent is running, then leave
            this session and start a fresh attempt.
          </Alert>
        </div>
      )}
      <p className="mt-4 text-center text-sm font-semibold">{agent.label}</p>
      <p className="mt-1 text-center text-xs text-muted">
        {state === 'listening' ? 'Go ahead and speak.' : 'Your microphone stays on throughout.'}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            const next = !isMicrophoneEnabled;
            log.info(`microphone ${next ? 'unmuted' : 'muted'}`);
            void localParticipant.setMicrophoneEnabled(next);
          }}
          className={cx(!isMicrophoneEnabled && 'border-danger/40 text-danger')}
        >
          {isMicrophoneEnabled ? (
            <MicIcon width={18} height={18} />
          ) : (
            <MicOffIcon width={18} height={18} />
          )}
          {isMicrophoneEnabled ? 'Mute' : 'Unmute'}
        </Button>
        <Button variant="danger" onClick={onLeave}>
          <PhoneOffIcon width={18} height={18} />
          Leave session
        </Button>
      </div>

      <StartAudio
        label="Your browser blocked audio. Click to hear the agent."
        className="mx-auto mt-4 block rounded-xl bg-warning-soft px-4 py-2 text-sm font-semibold text-warning"
      />
    </div>
  );
}

function Transcript() {
  const transcriptions = useTranscriptions();
  const { localParticipant } = useLocalParticipant();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [transcriptions]);

  return (
    <div className="flex max-h-[28rem] min-h-64 flex-col gap-3 overflow-y-auto px-6 py-5">
      {transcriptions.length === 0 ? (
        <p className="m-auto max-w-xs text-center text-sm text-muted">
          The conversation will appear here. The agent should greet you within a few seconds.
        </p>
      ) : (
        transcriptions.map((t) => {
          const mine = t.participantInfo.identity === localParticipant.identity;
          return (
            <div
              key={t.streamInfo.id}
              className={cx('flex', mine ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cx(
                  'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                  mine
                    ? 'rounded-br-md bg-brand text-brand-contrast'
                    : 'rounded-bl-md bg-surface-2 text-foreground',
                )}
              >
                <p
                  className={cx(
                    'mb-0.5 text-[11px] font-semibold',
                    mine ? 'opacity-80' : 'text-muted',
                  )}
                >
                  {mine ? 'You' : 'Agent'}
                </p>
                {t.text}
              </div>
            </div>
          );
        })
      )}
      <div ref={bottom} />
    </div>
  );
}

function capitalise(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
