import { llm, voice } from '@livekit/agents';
import type { StageMode } from '@safe-rehearse/agent-contracts';
import { buildInstructions, MODE_OPENERS } from '../agents/instructions.js';
import { createLogger, errorFields } from '../core/logger.js';
import type { SessionController } from '../core/session-controller.js';
import { toolsForMode } from '../core/tools.js';

/**
 * LiveKit adapter for one stage mode. Instructions and tools come from the
 * provider-neutral core. When the backend accepts a transition, the tool result
 * hands off to the agent for the next mode.
 */
export class StageAgent extends voice.Agent {
  constructor(
    private readonly controller: SessionController,
    private readonly mode: StageMode,
  ) {
    const tools = toolsForMode(mode);
    super({
      id: `stage-${mode.toLowerCase()}`,
      instructions: buildInstructions(mode, controller.context),
      tools: adaptTools(controller, mode),
    });
    createLogger('stage-agent', { attemptId: controller.attempt.id, mode }).debug('agent built', {
      tools: tools.map((t) => t.name),
    });
  }

  override async onEnter(): Promise<void> {
    createLogger('stage-agent', { attemptId: this.controller.attempt.id, mode: this.mode }).info(
      'entering mode; asking the model to open it',
    );
    this.session.generateReply({ instructions: MODE_OPENERS[this.mode] });
  }
}

function adaptTools(controller: SessionController, mode: StageMode): llm.ToolContextLike {
  const log = createLogger('tools', { attemptId: controller.attempt.id, mode });

  return Object.fromEntries(
    toolsForMode(mode).map((tool) => [
      tool.name,
      llm.tool({
        description: tool.description,
        parameters: tool.parameters,
        execute: async (args) => {
          const startedAt = Date.now();
          log.info('model called tool', { tool: tool.name, args });
          try {
            const outcome = await tool.run(controller, args);
            const fields = {
              tool: tool.name,
              accepted: outcome.accepted,
              ms: Date.now() - startedAt,
            };
            if (outcome.accepted) log.info('tool succeeded', fields);
            else log.warn('tool refused by backend', { ...fields, message: outcome.message });

            if (outcome.nextMode) {
              log.info('handing off to next mode', { to: outcome.nextMode });
              return llm.handoff({
                agent: new StageAgent(controller, outcome.nextMode),
                returns: outcome.message,
              });
            }
            return outcome.message;
          } catch (error) {
            log.error('tool threw', { tool: tool.name, ...errorFields(error) });
            return 'SafeRehearse could not be reached just now. Carry on with the current part.';
          }
        },
      }),
    ]),
  );
}
