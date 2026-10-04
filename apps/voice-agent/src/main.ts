import { fileURLToPath } from 'node:url';
import { cli, defineAgent, ServerOptions, voice, type JobContext } from '@livekit/agents';
import { AgentDispatchMetadata, type SessionEndReason } from '@safe-rehearse/agent-contracts';
import { loadConfig } from './config.js';
import { BackendClient } from './core/backend-client.js';
import { createLogger, errorFields } from './core/logger.js';
import { SessionController } from './core/session-controller.js';
import { StageAgent } from './livekit/stage-agent.js';
import { selectProvider } from './providers/index.js';

/**
 * LiveKit worker entry. One job = one learner's voice session for one StageAttempt.
 * The backend dispatches the job with the attempt id in its metadata.
 */
export default defineAgent({
  entry: async (ctx: JobContext) => {
    const jobLog = createLogger('job', { jobId: ctx.job.id, room: ctx.job.room?.name });
    jobLog.info('job received');

    let attemptId: string;
    try {
      ({ attemptId } = AgentDispatchMetadata.parse(JSON.parse(ctx.job.metadata || '{}')));
    } catch (error) {
      jobLog.error('job metadata is missing a valid attemptId; refusing the job', {
        metadata: ctx.job.metadata,
        ...errorFields(error),
      });
      ctx.shutdown('invalid dispatch metadata');
      return;
    }
    const log = jobLog.child({ attemptId });

    const config = loadConfig();
    const backend = new BackendClient(config.SAFE_REHEARSE_API_URL, config.AGENT_API_SECRET);

    let controller: SessionController;
    try {
      controller = await SessionController.open(backend, attemptId);
    } catch (error) {
      log.error('could not load session context from the API; is it running?', {
        api: config.SAFE_REHEARSE_API_URL,
        ...errorFields(error),
      });
      ctx.shutdown('context unavailable');
      return;
    }

    if (!controller.isLive || !(await controller.start())) {
      log.warn('attempt is not in progress; not starting a session', {
        status: controller.attempt.status,
      });
      ctx.shutdown('attempt not in progress');
      return;
    }

    // Fallback if the job ends without the session's close event (e.g. worker shutdown).
    ctx.addShutdownCallback(async () => {
      log.info('job shutting down');
      await controller.end('agent_error', 'job shut down before the session closed');
    });

    await ctx.connect();
    log.info('connected to room');

    const provider = selectProvider(config.VOICE_PROVIDER);
    const models = provider.createModels();
    log.info('voice models created', { provider: provider.id, kind: models.kind });

    // Realtime models detect turns server-side. Saying so explicitly stops LiveKit
    // provisioning its own local end-of-turn model, which costs CPU on every utterance.
    const session = new voice.AgentSession(
      models.kind === 'realtime'
        ? { llm: models.llm, turnHandling: { turnDetection: 'realtime_llm' } }
        : models,
    );

    session.on(voice.AgentSessionEventTypes.AgentStateChanged, ({ oldState, newState }) => {
      log.debug('agent state', { from: oldState, to: newState });
    });
    session.on(voice.AgentSessionEventTypes.UserStateChanged, ({ oldState, newState }) => {
      log.debug('learner state', { from: oldState, to: newState });
    });
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, ({ item }) => {
      if (item.type !== 'message') return;
      const text = item.textContent ?? '';
      if (item.role === 'user') {
        log.info('learner said', { text });
        controller.recordTranscript('LEARNER', text);
      }
      if (item.role === 'assistant') {
        log.info('agent said', { text });
        controller.recordTranscript('AGENT', text);
      }
    });
    session.on(voice.AgentSessionEventTypes.Error, ({ error }) => {
      log.error('session error', { detail: describeError(error) });
    });
    session.on(voice.AgentSessionEventTypes.Close, ({ reason, error }) => {
      const fields = { reason, ...(error ? { detail: describeError(error) } : {}) };
      if (error) log.error('session closed with an error', fields);
      else log.info('session closed', fields);
      const detail = error ? describeError(error) : `LiveKit close reason: ${reason}`;
      void controller.end(endReason(reason, error, controller), detail);
    });

    try {
      await session.start({ agent: new StageAgent(controller, controller.mode), room: ctx.room });
      log.info('session started', { mode: controller.mode });
    } catch (error) {
      log.error('session failed to start', errorFields(error));
      await controller.end('agent_error', 'session failed to start');
      ctx.shutdown('session failed to start');
    }
  },
});

function endReason(
  reason: voice.ShutdownReason,
  error: unknown,
  controller: SessionController,
): SessionEndReason {
  if (error || reason === voice.CloseReason.ERROR) return 'agent_error';
  if (reason === voice.CloseReason.PARTICIPANT_DISCONNECTED) return 'participant_left';
  // Only a graded attempt ended normally. An ungraded one closing for any other
  // reason (room closed, job shutdown) means the learner's connection went away.
  return controller.attempt.status === 'IN_PROGRESS' ? 'network_failure' : 'completed';
}

/** Extracts the useful message from LiveKit/provider error shapes (e.g. Gemini's body.reason). */
function describeError(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error);
  const inner = 'error' in error && error.error ? error.error : error;
  if (inner && typeof inner === 'object') {
    const body = 'body' in inner ? (inner.body as { reason?: unknown } | undefined) : undefined;
    if (body && typeof body.reason === 'string') return body.reason;
    if ('message' in inner && typeof inner.message === 'string' && inner.message) {
      return inner.message;
    }
  }
  return JSON.stringify(inner);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const provider = selectProvider(config.VOICE_PROVIDER);
  provider.validate();
  console.log(
    `[voice-agent] starting worker "${config.LIVEKIT_AGENT_NAME}" with provider "${provider.id}", ` +
      `API ${config.SAFE_REHEARSE_API_URL}, LiveKit ${process.env['LIVEKIT_URL'] ?? '(unset)'}`,
  );
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: config.LIVEKIT_AGENT_NAME,
      // The 10s default is too tight for job processes on modest dev machines.
      initializeProcessTimeout: 60_000,
    }),
  );
}
