import { z } from 'zod';
import { StageMode } from './domain.js';

/**
 * Visual lesson events flow one way: voice-agent → learner's browser, over the
 * LiveKit room on {@link LESSON_TOPIC}. They never change attempt state.
 *
 * The agent says WHAT to show; the web app decides how it looks. Events carry
 * content and a constrained presentation choice, never markup.
 */

export const LESSON_TOPIC = 'saferehearse.lesson';

/** Limits keep cards readable at a glance while the agent is speaking. */
export const LESSON_LIMITS = {
  title: 80,
  point: 160,
  points: 4,
  setting: 160,
  situation: 400,
  people: 4,
  person: 80,
} as const;

export const LessonTextVariant = z.enum(['info', 'key_point', 'warning']);
export type LessonTextVariant = z.infer<typeof LessonTextVariant>;

const Title = z.string().trim().min(1).max(LESSON_LIMITS.title);

/** Explanatory text: a heading and a few short points. */
export const ShowTextEvent = z.object({
  kind: z.literal('show_text'),
  title: Title,
  points: z
    .array(z.string().trim().min(1).max(LESSON_LIMITS.point))
    .min(1)
    .max(LESSON_LIMITS.points),
  variant: LessonTextVariant,
});
export type ShowTextEvent = z.infer<typeof ShowTextEvent>;

/** An example situation for the learner to picture. */
export const ShowScenarioEvent = z.object({
  kind: z.literal('show_scenario'),
  title: Title,
  setting: z.string().trim().min(1).max(LESSON_LIMITS.setting),
  situation: z.string().trim().min(1).max(LESSON_LIMITS.situation),
  people: z.array(z.string().trim().min(1).max(LESSON_LIMITS.person)).max(LESSON_LIMITS.people),
});
export type ShowScenarioEvent = z.infer<typeof ShowScenarioEvent>;

export const LessonEvent = z.discriminatedUnion('kind', [ShowTextEvent, ShowScenarioEvent]);
export type LessonEvent = z.infer<typeof LessonEvent>;
export type LessonEventKind = LessonEvent['kind'];

/** What travels on {@link LESSON_TOPIC}. */
export const LessonMessage = z.object({
  version: z.literal('1'),
  /** Unique per message, so the browser can de-duplicate. */
  id: z.uuid(),
  /** The mode the agent was in when it showed this. */
  mode: StageMode,
  sentAt: z.iso.datetime(),
  event: LessonEvent,
});
export type LessonMessage = z.infer<typeof LessonMessage>;
