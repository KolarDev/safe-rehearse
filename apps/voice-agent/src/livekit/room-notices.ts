import { randomUUID } from 'node:crypto';
import type { JobContext } from '@livekit/agents';
import {
  SESSION_NOTICE_TOPIC,
  type SessionNotice,
  type SessionNoticeKind,
} from '@safe-rehearse/agent-contracts';
import { errorFields, type Logger } from '../core/logger.js';

/** Tells the learner's browser about the voice service's health. Fire-and-forget. */
export function sendNotice(room: JobContext['room'], kind: SessionNoticeKind, log: Logger): void {
  const participant = room.localParticipant;
  if (!participant) return;
  const notice: SessionNotice = {
    version: '1',
    id: randomUUID(),
    sentAt: new Date().toISOString(),
    kind,
  };
  participant
    .sendText(JSON.stringify(notice), { topic: SESSION_NOTICE_TOPIC })
    .then(() => log.info('notice sent to learner', { kind }))
    .catch((error: unknown) =>
      log.warn('notice could not be sent', { kind, ...errorFields(error) }),
    );
}
