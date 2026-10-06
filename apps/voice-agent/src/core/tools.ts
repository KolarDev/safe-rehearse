import { LESSON_LIMITS, LessonTextVariant, type StageMode } from '@safe-rehearse/agent-contracts';
import { z } from 'zod';
import type { SessionController, ToolOutcome } from './session-controller.js';

/**
 * Provider-neutral tool definitions. A transport adapter (LiveKit today) turns
 * these into whatever its model expects. Every tool reports to the backend via
 * the SessionController and hands the backend's answer back to the model.
 */
export interface AgentTool<S extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  parameters: S;
  run(controller: SessionController, args: z.infer<S>): Promise<ToolOutcome>;
}

const define = <S extends z.ZodObject>(tool: AgentTool<S>) => tool as unknown as AgentTool;

/** Over-long model text is shortened for the screen rather than refused mid-turn. */
const clamp = (text: string, max: number) => {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
};

/**
 * Visual lesson tools. Teaching only for now: on-screen content during practice
 * or assessment could hand the learner hints.
 */
function lessonTools(): AgentTool[] {
  const showText = define({
    name: 'show_text',
    description:
      "Put a short card on the learner's screen while you keep talking. Use it when you introduce a key " +
      'idea, a definition, or steps to remember. Keep it brief: a title and up to four short points. ' +
      'Only use content from the course knowledge.',
    parameters: z.object({
      title: z.string().min(1).describe('A short heading, a few words.'),
      points: z
        .array(z.string().min(1))
        .min(1)
        .describe(`Up to ${LESSON_LIMITS.points} short points, one line each.`),
      variant: LessonTextVariant.describe(
        'info for explanation, key_point for something to remember, warning for a risk or something never to do.',
      ),
    }),
    run: async (controller, args) =>
      controller.present({
        kind: 'show_text',
        title: clamp(args.title, LESSON_LIMITS.title),
        points: args.points
          .slice(0, LESSON_LIMITS.points)
          .map((p) => clamp(p, LESSON_LIMITS.point)),
        variant: args.variant,
      }),
  });

  const showScenario = define({
    name: 'show_scenario',
    description:
      "Put an example situation on the learner's screen while you describe it. Use it when you walk " +
      'through an example, so the learner can picture who is involved and what is happening.',
    parameters: z.object({
      title: z.string().min(1).describe('A short name for the example.'),
      setting: z.string().min(1).describe('Where and when it happens, in one sentence.'),
      situation: z.string().min(1).describe('What happens, in two or three sentences.'),
      people: z
        .array(z.string().min(1))
        .optional()
        .describe('Who is involved, e.g. "Mrs Ellis, 82, lives alone". Up to four.'),
    }),
    run: async (controller, args) =>
      controller.present({
        kind: 'show_scenario',
        title: clamp(args.title, LESSON_LIMITS.title),
        setting: clamp(args.setting, LESSON_LIMITS.setting),
        situation: clamp(args.situation, LESSON_LIMITS.situation),
        people: (args.people ?? [])
          .slice(0, LESSON_LIMITS.people)
          .map((p) => clamp(p, LESSON_LIMITS.person)),
      }),
  });

  return [showText, showScenario];
}

export function toolsForMode(mode: StageMode): AgentTool[] {
  const completeMode = define({
    name: 'complete_mode',
    description:
      'Call once this part of the session is genuinely finished. SafeRehearse decides whether to move on; ' +
      'follow what the result tells you.',
    parameters: z.object({}),
    run: (controller) => controller.completeMode(),
  });

  if (mode === 'PRACTICE_PARTNER') {
    const recordFeedback = define({
      name: 'record_feedback',
      description:
        'Record the formative feedback you gave the learner after the practice. Practice is never graded.',
      parameters: z.object({
        message: z.string().min(1).describe('The feedback you gave, in brief.'),
      }),
      run: (controller, args) => controller.recordFeedback(args.message),
    });
    return [recordFeedback, completeMode];
  }

  if (mode === 'EXAMINER') {
    // No evidence tool: Gemini Live crashes (1011) when it calls a tool while in
    // character. Evidence is extracted from the transcript once the exam ends.
    const finishExam = define({
      ...completeMode,
      description:
        'Call once the assessed role-play is genuinely finished and the learner has had the chance to respond. ' +
        'Before calling, step out of character and tell the learner the assessment is over and that you will ' +
        'take a moment to record it. SafeRehearse then assesses the conversation; follow what the result tells you.',
    });
    return [finishExam];
  }

  return [...lessonTools(), completeMode];
}
