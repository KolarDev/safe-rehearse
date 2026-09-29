import { fileURLToPath } from 'node:url';
import { cli, defineAgent, ServerOptions, voice, type JobContext } from '@livekit/agents';
import { AgentDispatchMetadata, type SessionEndReason } from '@safe-rehearse/agent-contracts';
import { loadConfig } from './config.js';
import { BackendClient } from './core/backend-client.js';
import { SessionController } from './core/session-controller.js';
import { StageAgent } from './livekit/stage-agent.js';
import { selectProvider } from './providers/index.js';

/**
 * LiveKit worker entry. One job = one learner's voice session for one StageAttempt.
 * The backend dispatches the job with the attempt id in its metadata.
 */
export default defineAgent({
  entry: async (ctx: JobContext) => {
    const config = loadConfig();
    const { attemptId } = AgentDispatchMetadata.parse(JSON.parse(ctx.job.metadata || '{}'));
    const backend = new BackendClient(config.SAFE_REHEARSE_API_URL, config.AGENT_API_SECRET);

    const controller = await SessionController.open(backend, attemptId);
    if (!controller.isLive || !(await controller.start())) {
      console.warn(`attempt ${attemptId} is ${controller.attempt.status}; not starting a session`);
      ctx.shutdown('attempt not in progress');
      return;
    }

    // Fallback if the job ends without the session's close event (e.g. worker shutdown).
    ctx.addShutdownCallback(() =>
      controller.end('agent_error', 'job shut down before the session closed'),
    );

    await ctx.connect();

    const models = selectProvider(config.VOICE_PROVIDER).createModels();
    const session = new voice.AgentSession(
      models.kind === 'realtime' ? { llm: models.llm } : models,
    );

    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
      if (item.type !== 'message') return;
      if (item.role === 'user') controller.recordTranscript('LEARNER', item.textContent ?? '');
      if (item.role === 'assistant') controller.recordTranscript('AGENT', item.textContent ?? '');
    });

    session.on(voice.AgentSessionEventTypes.Close, ({ reason, error }) => {
      void controller.end(endReason(reason, error), error ? describeError(error) : undefined);
    });

    await session.start({ agent: new StageAgent(controller, controller.mode), room: ctx.room });
  },
});

function endReason(reason: voice.ShutdownReason, error: unknown): SessionEndReason {
  if (error) return 'agent_error';
  if (reason === voice.CloseReason.PARTICIPANT_DISCONNECTED) return 'participant_left';
  if (reason === voice.CloseReason.ERROR) return 'agent_error';
  // The session closed normally. If the attempt was graded this is a no-op; if not, it drops.
  return 'completed';
}

function describeError(error: object): string {
  const inner = 'error' in error && error.error instanceof Error ? error.error : error;
  return inner instanceof Error ? inner.message : String(inner);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  selectProvider(config.VOICE_PROVIDER).validate();
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: config.LIVEKIT_AGENT_NAME,
      // The 10s default is too tight for job processes on modest dev machines.
      initializeProcessTimeout: 60_000,
    }),
  );
}
