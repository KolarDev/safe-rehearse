import type { AgentSessionContext, StageMode } from '@safe-rehearse/agent-contracts';
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

export function toolsForMode(mode: StageMode, context: AgentSessionContext): AgentTool[] {
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
    const criterionIds = context.criteria.map((c) => c.id);
    const recordEvidence = define({
      name: 'record_evidence',
      description:
        'Record evidence that the learner met an assessment criterion. Call it each time the learner says or does ' +
        'something relevant. You do not decide the grade; SafeRehearse does.',
      parameters: z.object({
        criterion_id: z
          .enum(criterionIds as [string, ...string[]])
          .describe('The criterion the evidence supports.'),
        evidence: z
          .string()
          .min(1)
          .describe('What the learner said or did, quoted or closely paraphrased.'),
        confidence: z
          .number()
          .min(0)
          .max(1)
          .describe('How clearly this shows the criterion, from 0 to 1.'),
      }),
      run: (controller, args) =>
        controller.recordEvidence(args.criterion_id, args.evidence, args.confidence),
    });
    return criterionIds.length > 0 ? [recordEvidence, completeMode] : [completeMode];
  }

  return [completeMode];
}
