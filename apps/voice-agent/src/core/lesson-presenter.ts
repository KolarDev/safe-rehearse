import type { LessonMessage } from '@safe-rehearse/agent-contracts';

/**
 * Puts visual lesson content on the learner's screen. The core decides what to
 * show; the transport (LiveKit today) decides how it gets there.
 *
 * `show` must return at once and never throw: a visual is extra, and must never
 * hold up or break the conversation.
 */
export interface LessonPresenter {
  show(message: LessonMessage): void;
}

/** For runs with no screen to show on, such as the simulator. */
export const noScreen: LessonPresenter = { show: () => undefined };
