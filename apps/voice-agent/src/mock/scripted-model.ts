import type { AttemptStatus, StageMode } from '@safe-rehearse/agent-contracts';
import type { SessionController } from '../core/session-controller.js';
import { toolsForMode } from '../core/tools.js';

/**
 * A scripted stand-in for a voice model. It "speaks" transcript lines and calls
 * the same provider-neutral tools a real model would, through the same
 * SessionController and against the real backend, with no LiveKit and no AI.
 */
export type Step =
  | { learner: string }
  | { agent: string }
  | { tool: string; args?: Record<string, unknown>; expect?: 'accepted' | 'rejected' }
  /** A misbehaving model that bypasses the tool layer and sends evidence directly. */
  | { rogueEvidence: string; expect: 'accepted' | 'rejected' }
  | { disconnect: true }
  | { assert: { mode?: StageMode; status?: AttemptStatus } };

export async function runScript(
  controller: SessionController,
  steps: Step[],
  log = console.log,
): Promise<void> {
  for (const step of steps) {
    if ('learner' in step) {
      log(`  learner: ${step.learner}`);
      controller.recordTranscript('LEARNER', step.learner);
    } else if ('agent' in step) {
      log(`  agent:   ${step.agent}`);
      controller.recordTranscript('AGENT', step.agent);
    } else if ('tool' in step) {
      const tool = toolsForMode(controller.mode, controller.context).find(
        (t) => t.name === step.tool,
      );
      if (!tool) {
        if (step.expect === 'rejected') {
          log(`  tool ${step.tool} → not offered in ${controller.mode} (as expected)`);
          continue;
        }
        throw new Error(`Tool ${step.tool} is not available in mode ${controller.mode}`);
      }
      const outcome = await tool.run(controller, tool.parameters.parse(step.args ?? {}));
      log(`  tool ${step.tool} → ${outcome.message}`);
      if (step.expect && (step.expect === 'accepted') !== outcome.accepted) {
        throw new Error(`Expected ${step.tool} to be ${step.expect}, got: ${outcome.message}`);
      }
    } else if ('rogueEvidence' in step) {
      const outcome = await controller.recordEvidence(step.rogueEvidence, 'rogue evidence', 1);
      log(`  rogue evidence in ${controller.mode} → ${outcome.message}`);
      if ((step.expect === 'accepted') !== outcome.accepted) {
        throw new Error(`Expected rogue evidence to be ${step.expect}, got: ${outcome.message}`);
      }
    } else if ('disconnect' in step) {
      log('  (learner disconnects)');
      await controller.end('participant_left');
    } else {
      const { mode, status } = step.assert;
      const actual = controller.attempt;
      if ((mode && actual.mode !== mode) || (status && actual.status !== status)) {
        throw new Error(
          `Expected ${JSON.stringify(step.assert)}, got mode=${actual.mode} status=${actual.status}`,
        );
      }
      log(`  ✓ attempt is ${actual.status} in ${actual.mode}`);
    }
  }
}
