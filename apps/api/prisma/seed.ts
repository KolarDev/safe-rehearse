/**
 * Development seed: one sample scenario with one stage, so the full
 * Teacher → Practice Partner → Examiner → Result flow can run locally.
 *
 * SAMPLE CONTENT ONLY. It has not been reviewed by a safeguarding expert and
 * must be replaced by expert-authored material before any learner sees it.
 *
 * Idempotent: re-running replaces the sample scenario's stages.
 */
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

config({ path: ['.env', '../../.env'], quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }),
});

const SCENARIO_SLUG = 'sample-safeguarding-disclosure';

async function main() {
  const scenario = await prisma.scenario.upsert({
    where: { slug: SCENARIO_SLUG },
    update: {},
    create: {
      slug: SCENARIO_SLUG,
      title: '[Sample] Safeguarding: responding to a disclosure',
      description: 'Development sample. Not expert-reviewed.',
    },
  });

  // Attempts reference stages without cascade, so clear sample attempts first.
  await prisma.stageAttempt.deleteMany({ where: { stage: { scenarioId: scenario.id } } });
  await prisma.stage.deleteMany({ where: { scenarioId: scenario.id } });

  await prisma.stage.create({
    data: {
      scenarioId: scenario.id,
      position: 1,
      title: 'Responding when someone tells you about abuse',
      learningObjectives: [
        'Recognise when what someone tells you is a safeguarding concern',
        'Respond calmly and listen without leading questions',
        'Explain that you cannot keep it secret and must pass it on',
        'Know to report to your manager or safeguarding lead and record the facts',
      ],
      teacherInstructions:
        'Teach the learner, conversationally, how to respond when a person they support discloses possible abuse. ' +
        'Cover each learning objective using the provided knowledge. Check understanding with short questions. ' +
        'Keep turns brief. When every objective has been covered and the learner seems ready, finish this mode.',
      practiceInstructions:
        'Role-play Mrs Ellis, an 82-year-old woman receiving home care, who hints that her nephew takes money from her purse ' +
        'and asks the learner to keep it secret. Stay in character. After the role-play, step out of character and give ' +
        'brief, kind, formative feedback, then finish this mode. Practice is never graded.',
      examinerInstructions:
        'Run a short assessed role-play with a similar disclosure (a man says a family member shouts at him and has pushed him). ' +
        'Stay neutral and do not coach or hint. Whenever the learner does something that meets a criterion, record evidence ' +
        'with a direct quote or close paraphrase. Do not tell the learner whether they passed. When the role-play is done, finish this mode.',
      knowledge: {
        create: [
          {
            position: 1,
            title: 'What a disclosure is',
            content:
              'A disclosure is when someone tells you, directly or through hints, that they are being harmed or are at risk. ' +
              'Abuse can be physical, emotional, financial, sexual, neglect, or discriminatory, among others.',
          },
          {
            position: 2,
            title: 'How to respond',
            content:
              'Stay calm. Listen. Let the person speak in their own words and do not ask leading questions or investigate. ' +
              'Reassure them they were right to tell you. Do not promise to keep it secret: explain kindly that you must share it ' +
              'with people who can help keep them safe.',
          },
          {
            position: 3,
            title: 'What to do next',
            content:
              'Report the concern to your manager or designated safeguarding lead without delay, following your organisation’s policy. ' +
              'If someone is in immediate danger, call emergency services. Write down what was said, factually and in the person’s words, ' +
              'with the date and time.',
          },
        ],
      },
      criteria: {
        create: [
          {
            position: 1,
            key: 'recognises-safeguarding-concern',
            description: 'Recognises the disclosure as a possible safeguarding concern.',
          },
          {
            position: 2,
            key: 'no-promise-of-secrecy',
            description:
              'Does not promise to keep the disclosure secret and explains why it must be shared.',
          },
          {
            position: 3,
            key: 'reports-to-lead',
            description: 'States they will report to a manager or designated safeguarding lead.',
          },
        ],
      },
    },
  });

  console.log(`Seeded sample scenario "${scenario.title}".`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
