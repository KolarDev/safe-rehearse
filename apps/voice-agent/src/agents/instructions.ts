import type { AgentSessionContext, StageMode } from '@safe-rehearse/agent-contracts';

/**
 * Builds the system instructions for each role from backend-supplied context.
 * All course content comes from the backend; nothing here is provider-specific.
 */

const ROLE: Record<StageMode, string> = {
  TEACHER: 'You are the Teacher. Your job: "Let me teach you this."',
  PRACTICE_PARTNER: 'You are the Practice Partner. Your job: "Let\'s practise this situation."',
  EXAMINER: 'You are the Examiner. Your job: "I\'m going to assess how you handle this."',
};

const GROUND_RULES = [
  'You are a voice agent in SafeRehearse, a training platform for frontline social-care workers.',
  'Speak naturally and briefly: one or two sentences per turn, then let the learner respond.',
  'Use UK English.',
  'Only teach from the course knowledge below. If something is not covered, say so rather than inventing guidance.',
  'You never decide whether the learner has passed. SafeRehearse applies the assessment rules.',
  'Use your tools as described. When a tool result tells you what happens next, follow it.',
].join('\n- ');

const VISUAL_GUIDANCE = [
  'Visual board: the learner sees a screen beside you. Use it to support what you say, as a teacher uses a whiteboard.',
  '- When you introduce a key idea, definition, or steps to remember, call show_text at the same time as you start explaining it.',
  '- When you walk through an example, call show_scenario as you begin describing it.',
  '- Aim for two to four visuals across the teaching, not one per sentence. Never show the same thing twice.',
  '- Keep talking naturally. Do not read the card out word for word, and do not mention the tools.',
].join('\n');

export function buildInstructions(mode: StageMode, context: AgentSessionContext): string {
  const brief = context.modes.find((m) => m.mode === mode);
  const knowledge = context.knowledge.map((k) => `### ${k.title}\n${k.content}`).join('\n\n');
  const objectives = context.stage.learningObjectives.map((o) => `- ${o}`).join('\n');

  const sections = [
    ROLE[mode],
    `Ground rules:\n- ${GROUND_RULES}`,
    `Scenario: ${context.stage.scenarioTitle}\nStage: ${context.stage.title}`,
    `Learning objectives:\n${objectives}`,
    `Instructions for this part (from the course author):\n${brief?.instructions ?? ''}`,
    `Course knowledge:\n${knowledge}`,
  ];

  if (mode === 'TEACHER') {
    sections.push(VISUAL_GUIDANCE);
  }

  if (mode === 'EXAMINER') {
    const criteria = context.criteria.map((c) => `- ${c.description}`).join('\n');
    sections.push(
      'Assessment criteria. SafeRehearse assesses the learner against these from the conversation once the ' +
        'role-play ends; you do not record anything. Play the scene so the learner has a fair chance to show ' +
        `each one, but never reveal them or hint at them:\n${criteria}`,
    );
  }

  return sections.join('\n\n');
}

/** What the agent says after the voice service reconnects mid-session. */
export const RESUME_AFTER_RECONNECT =
  'There was a brief technical interruption and you may have missed what the learner just said. ' +
  'Apologise in one short sentence, ask them to repeat their last answer, then carry on from where you were, ' +
  'in the same role.';

/** What the agent says as it enters each mode. */
export const MODE_OPENERS: Record<StageMode, string> = {
  TEACHER: 'Greet the learner, say what this stage is about, and begin teaching.',
  PRACTICE_PARTNER:
    'Explain that you will now practise the situation together, set the scene briefly, then start the role-play.',
  EXAMINER:
    'Explain that this is the assessed part, that you will not give hints, and start the role-play.',
};
