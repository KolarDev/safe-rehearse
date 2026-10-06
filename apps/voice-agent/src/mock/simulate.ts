/**
 * Runs scripted sessions against a running API. No LiveKit, no model, no cost.
 *
 *   pnpm --filter voice-agent simulate            # all scenarios
 *   pnpm --filter voice-agent simulate pass drop  # selected scenarios
 *
 * Requires the API running with the sample seed (pnpm db:seed).
 */
import { AttemptSnapshot } from '@safe-rehearse/agent-contracts';
import { StageSummary } from '@safe-rehearse/types';
import { z } from 'zod';
import { loadConfig } from '../config.js';
import { BackendClient } from '../core/backend-client.js';
import type { EvidenceExtractor } from '../core/evidence-extractor.js';
import type { LessonPresenter } from '../core/lesson-presenter.js';
import { SessionController } from '../core/session-controller.js';
import { SCENARIOS, type Scenario } from './scenarios.js';
import { runScript } from './scripted-model.js';

const config = loadConfig();
const api = config.SAFE_REHEARSE_API_URL;
const backend = new BackendClient(api, config.AGENT_API_SECRET);
const learnerRef = `simulator-${Date.now()}`;

async function http<T extends z.ZodType>(
  schema: T,
  path: string,
  body?: unknown,
): Promise<z.infer<T>> {
  const response = await fetch(new URL(path, api), {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${path} → ${response.status}: ${await response.text()}`);
  return schema.parse(await response.json());
}

/** Prints what would appear on the learner's screen. */
const consoleScreen: LessonPresenter = {
  show: ({ event }) => console.log(`  screen:  [${event.kind}] ${event.title}`),
};

/** Stands in for the evidence model: "finds" what the scenario scripts. */
const scriptedExtractor = (scenario: Scenario): EvidenceExtractor => ({
  id: 'scripted',
  extract: async ({ transcript }) => {
    const said = transcript.filter((l) => l.speaker === 'LEARNER').length;
    console.log(`  assess:  ${transcript.length} exam line(s), ${said} from the learner`);
    if (scenario.evidence === 'fail') throw new Error('scripted extraction outage');
    return scenario.evidence ?? [];
  },
});

const startAttempt = (stageId: string) =>
  http(AttemptSnapshot, '/stage-attempts', { stageId, learnerRef });

async function main() {
  const [stage] = await http(z.array(StageSummary), '/stages');
  if (!stage) throw new Error('No stages found. Run `pnpm db:seed` first.');

  const selected = process.argv.slice(2).filter((a) => a !== '--');
  const names = selected.length > 0 ? selected : Object.keys(SCENARIOS);
  let failures = 0;

  for (const name of names) {
    const scenario = SCENARIOS[name];
    if (!scenario)
      throw new Error(
        `Unknown scenario "${name}". Available: ${Object.keys(SCENARIOS).join(', ')}`,
      );
    console.log(`\n▶ ${name}: ${scenario.description}`);

    try {
      const attempt = await startAttempt(stage.id);
      const controller = await SessionController.open(backend, attempt.id, {
        extractor: scriptedExtractor(scenario),
        presenter: consoleScreen,
      });
      await controller.start();
      await runScript(controller, scenario.steps);

      if (name === 'drop') {
        // Retry = a fresh attempt. The dropped one stays dropped and contributes nothing.
        const retry = await startAttempt(stage.id);
        const dropped = await http(AttemptSnapshot, `/stage-attempts/${attempt.id}`);
        if (dropped.status !== 'DROPPED')
          throw new Error(`Expected DROPPED, got ${dropped.status}`);
        if (retry.id === attempt.id || retry.mode !== 'TEACHER' || retry.status !== 'IN_PROGRESS') {
          throw new Error(`Retry did not start fresh: ${JSON.stringify(retry)}`);
        }
        console.log(`  ✓ retry started fresh attempt ${retry.id} in TEACHER`);
        await http(AttemptSnapshot, `/stage-attempts/${retry.id}/abandon`, {});
      }
      console.log(`✔ ${name}`);
    } catch (error) {
      failures++;
      console.error(`✘ ${name}: ${(error as Error).message}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} scenario(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\nAll scenarios passed');
  }
}

await main();
