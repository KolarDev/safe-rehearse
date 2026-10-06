import type { JobContext } from '@livekit/agents';
import { LESSON_TOPIC, type LessonMessage } from '@safe-rehearse/agent-contracts';
import type { LessonPresenter } from '../core/lesson-presenter.js';
import { errorFields, type Logger } from '../core/logger.js';

/**
 * Sends lesson events to everyone in the room as a LiveKit text stream on
 * LESSON_TOPIC, alongside the audio and the transcript stream. Fire-and-forget:
 * a lost visual is logged, never retried, and never blocks the voice loop.
 */
export function roomPresenter(room: JobContext['room'], log: Logger): LessonPresenter {
  return {
    show(message: LessonMessage) {
      const participant = room.localParticipant;
      if (!participant) {
        log.warn('not in the room yet; lesson event not shown', { kind: message.event.kind });
        return;
      }
      const startedAt = Date.now();
      participant
        .sendText(JSON.stringify(message), { topic: LESSON_TOPIC })
        .then(() =>
          log.debug('lesson event sent', { kind: message.event.kind, ms: Date.now() - startedAt }),
        )
        .catch((error: unknown) =>
          log.warn('lesson event could not be sent', {
            kind: message.event.kind,
            ...errorFields(error),
          }),
        );
    },
  };
}
