import { z } from 'zod';

/**
 * Session notices flow one way: voice-agent → learner's browser, over the
 * LiveKit room on {@link SESSION_NOTICE_TOPIC}. They tell the learner about the
 * health of the voice service while a session is still running. How a session
 * ENDED is not a notice: the browser reads that from the backend's attempt state.
 */

export const SESSION_NOTICE_TOPIC = 'saferehearse.notice';

export const SessionNoticeKind = z.enum([
  /** The AI voice service had a transient problem; the agent is reconnecting. */
  'voice_reconnecting',
  /** The agent is back and speaking again after a reconnect. */
  'voice_restored',
]);
export type SessionNoticeKind = z.infer<typeof SessionNoticeKind>;

export const SessionNotice = z.object({
  version: z.literal('1'),
  id: z.uuid(),
  sentAt: z.iso.datetime(),
  kind: SessionNoticeKind,
});
export type SessionNotice = z.infer<typeof SessionNotice>;
