import { llm, voice } from '@livekit/agents';
import type { StageMode } from '@safe-rehearse/agent-contracts';
import { buildInstructions, MODE_OPENERS } from '../agents/instructions.js';
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
    super({
      id: `stage-${mode.toLowerCase()}`,
      instructions: buildInstructions(mode, controller.context),
      tools: adaptTools(controller, mode),
    });
  }

  override async onEnter(): Promise<void> {
    this.session.generateReply({ instructions: MODE_OPENERS[this.mode] });
  }
}

function adaptTools(controller: SessionController, mode: StageMode): llm.ToolContextLike {
  return Object.fromEntries(
    toolsForMode(mode, controller.context).map((tool) => [
      tool.name,
      llm.tool({
        description: tool.description,
        parameters: tool.parameters,
        execute: async (args) => {
          const outcome = await tool.run(controller, args);
          return outcome.nextMode
            ? llm.handoff({
                agent: new StageAgent(controller, outcome.nextMode),
                returns: outcome.message,
              })
            : outcome.message;
        },
      }),
    ]),
  );
}
