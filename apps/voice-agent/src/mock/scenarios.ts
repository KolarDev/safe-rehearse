import type { Step } from './scripted-model.js';

/**
 * Scripted sessions for the sample safeguarding stage (see apps/api/prisma/seed.ts).
 * Each exercises the real backend rules without any AI.
 */

const teachAndPractise: Step[] = [
  { assert: { mode: 'TEACHER', status: 'IN_PROGRESS' } },
  { agent: "Hello! Today we'll cover what to do when someone tells you about abuse." },
  { learner: "Okay, I'm ready." },
  { tool: 'record_evidence', expect: 'rejected' }, // not offered while teaching
  { rogueEvidence: 'recognises-safeguarding-concern', expect: 'rejected' }, // backend refuses evidence outside the Examiner
  { tool: 'complete_mode', expect: 'accepted' },
  { assert: { mode: 'PRACTICE_PARTNER', status: 'IN_PROGRESS' } },
  { agent: "I'm Mrs Ellis. Promise you won't tell anyone about my nephew?" },
  { learner: "I can't keep it secret, but I will make sure you get help." },
  {
    tool: 'record_feedback',
    args: { message: 'Good: you did not promise secrecy.' },
    expect: 'accepted',
  },
  { tool: 'complete_mode', expect: 'accepted' },
  { assert: { mode: 'EXAMINER', status: 'IN_PROGRESS' } },
];

const evidence = (criterion_id: string, confidence: number): Step => ({
  tool: 'record_evidence',
  args: { criterion_id, evidence: 'Learner response', confidence },
  expect: 'accepted',
});

export const SCENARIOS: Record<string, { description: string; steps: Step[] }> = {
  pass: {
    description: 'Full stage; every criterion evidenced → PASSED',
    steps: [
      ...teachAndPractise,
      {
        learner:
          "That sounds like abuse. I can't keep it secret; I'll report it to my manager today.",
      },
      evidence('recognises-safeguarding-concern', 0.92),
      evidence('no-promise-of-secrecy', 0.88),
      evidence('reports-to-lead', 0.9),
      { tool: 'complete_mode', expect: 'accepted' },
      { assert: { status: 'PASSED' } },
      { tool: 'complete_mode', expect: 'rejected' }, // a graded attempt can no longer change
    ],
  },
  fail: {
    description: 'Full stage; one criterion weakly evidenced → FAILED',
    steps: [
      ...teachAndPractise,
      { learner: "That's worrying. Let's keep it between us for now." },
      evidence('recognises-safeguarding-concern', 0.8),
      evidence('reports-to-lead', 0.4), // below the criterion's confidence threshold
      { tool: 'complete_mode', expect: 'accepted' },
      { assert: { status: 'FAILED' } },
    ],
  },
  drop: {
    description: 'Learner disconnects during practice → DROPPED (retry is checked by the runner)',
    steps: [...teachAndPractise.slice(0, 7), { disconnect: true }],
  },
};
