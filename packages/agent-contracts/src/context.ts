import { z } from 'zod';
import { AttemptSnapshot, StageMode } from './domain.js';

/**
 * Everything the agent needs to run a session, served by the backend.
 * The agent holds no course content of its own. It comes from the backend's
 * knowledge service, so it stays independent of the model provider.
 */

export const ModeBrief = z.object({
  mode: StageMode,
  /** Expert-authored instructions for how the agent behaves in this mode. */
  instructions: z.string(),
});
export type ModeBrief = z.infer<typeof ModeBrief>;

export const CriterionBrief = z.object({
  id: z.string(),
  description: z.string(),
});
export type CriterionBrief = z.infer<typeof CriterionBrief>;

export const AgentSessionContext = z.object({
  attempt: AttemptSnapshot,
  stage: z.object({
    id: z.string(),
    title: z.string(),
    scenarioTitle: z.string(),
    learningObjectives: z.array(z.string()),
  }),
  /** Course knowledge relevant to this stage, selected by the backend. */
  knowledge: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
    }),
  ),
  modes: z.array(ModeBrief),
  /** Criteria the Examiner gathers evidence against. The agent never grades them. */
  criteria: z.array(CriterionBrief),
});
export type AgentSessionContext = z.infer<typeof AgentSessionContext>;

/**
 * Metadata attached to the LiveKit agent dispatch, so the agent knows which
 * attempt a room belongs to.
 */
export const AgentDispatchMetadata = z.object({
  attemptId: z.string().min(1),
});
export type AgentDispatchMetadata = z.infer<typeof AgentDispatchMetadata>;
