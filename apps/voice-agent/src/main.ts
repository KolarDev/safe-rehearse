import { fileURLToPath } from 'node:url';
import { cli, defineAgent, ServerOptions, voice, type JobContext } from '@livekit/agents';
import { AgentDispatchMetadata, type SessionEndReason } from '@safe-rehearse/agent-contracts';
import { RESUME_AFTER_RECONNECT } from './agents/instructions.js';
import { loadConfig } from './config.js';
import { BackendClient } from './core/backend-client.js';
import { createLogger, errorFields } from './core/logger.js';
import { SessionController } from './core/session-controller.js';
import { sendNotice } from './livekit/room-notices.js';
import { roomPresenter } from './livekit/room-presenter.js';
import { StageAgent } from './livekit/stage-agent.js';
import { createEvidenceExtractor, selectProvider } from './providers/index.js';

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
      controller = await SessionController.open(backend, attemptId, {
        extractor: createEvidenceExtractor(),
        presenter: roomPresenter(
          ctx.room,
          createLogger('lesson', { jobId: ctx.job.id, attemptId }),
        ),
      });
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
      // The room belongs to a finished attempt. Close it so LiveKit stops dispatching
      // agents into it and any learner still connected is disconnected.
      await closeRoom(ctx, log, 'attempt not in progress');
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

    // Set while the voice model reconnects after a transient provider error; cleared
    // when the agent speaks again, which is when the learner hears that it's back.
    let reconnecting = false;
    const noticeLog = createLogger('notice', { jobId: ctx.job.id, attemptId });

    session.on(voice.AgentSessionEventTypes.AgentStateChanged, ({ oldState, newState }) => {
      log.debug('agent state', { from: oldState, to: newState });
      if (reconnecting && newState === 'speaking') {
        reconnecting = false;
        log.info('voice model reconnected; agent speaking again');
        sendNotice(ctx.room, 'voice_restored', noticeLog);
      }
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
      // A recoverable model error means the provider dropped the connection with a
      // transient fault and is reconnecting (see patches/@livekit__agents-plugin-google).
      // The session carries on: tell the learner, and have the agent pick up again.
      if (error.type === 'realtime_model_error' && error.recoverable) {
        log.warn('voice model connection lost; reconnecting', { detail: describeError(error) });
        reconnecting = true;
        sendNotice(ctx.room, 'voice_reconnecting', noticeLog);
        try {
          session.generateReply({ instructions: RESUME_AFTER_RECONNECT });
        } catch (replyError) {
          log.warn('could not ask the agent to resume; it will reply when the learner speaks', {
            ...errorFields(replyError),
          });
        }
        return;
      }
      log.error('session error', { detail: describeError(error) });
    });
    session.on(voice.AgentSessionEventTypes.Close, ({ reason, error }) => {
      const fields = { reason, ...(error ? { detail: describeError(error) } : {}) };
      if (error) log.error('session closed with an error', fields);
      else log.info('session closed', fields);
      const detail = error ? describeError(error) : `LiveKit close reason: ${reason}`;
      void controller.end(endReason(reason, error, controller), detail).then(async () => {
        // After a model/agent failure the attempt is dropped. Close the room so the
        // learner's page disconnects at once (and shows the drop) and LiveKit does
        // not re-dispatch an agent into a dead room.
        if (error || reason === voice.CloseReason.ERROR) {
          await closeRoom(ctx, log, 'agent session failed');
        }
      });
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

async function closeRoom(
  ctx: JobContext,
  log: ReturnType<typeof createLogger>,
  why: string,
): Promise<void> {
  try {
    await ctx.deleteRoom(ctx.job.room?.name);
    log.info('room closed', { why });
  } catch (error) {
    log.warn('could not close the room', { why, ...errorFields(error) });
  }
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
  createEvidenceExtractor().validate();
  console.log(
    `[voice-agent] starting worker "${config.LIVEKIT_AGENT_NAME}" with provider "${provider.id}", ` +
      `API ${config.SAFE_REHEARSE_API_URL}, LiveKit ${process.env['LIVEKIT_URL'] ?? '(unset)'}`,
  );
  let atCapacity = false;
  cli.runApp(
    new ServerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: config.LIVEKIT_AGENT_NAME,
      // The 10s default is too tight for job processes on modest dev machines.
      initializeProcessTimeout: 60_000,
      // LiveKit's default load is whole-machine CPU. On a busy machine that sits near
      // 100%, so LiveKit treats the worker as full and silently never dispatches the
      // job: the learner waits forever. Capacity is really "how many sessions this
      // worker runs", so report that instead.
      loadFunc: async (server) => {
        const load = Math.min(server.activeJobs.length / config.AGENT_MAX_SESSIONS, 1);
        if (load >= 1 !== atCapacity) {
          atCapacity = load >= 1;
          console.warn(
            atCapacity
              ? `[voice-agent] at capacity (${config.AGENT_MAX_SESSIONS} sessions); new sessions wait until one ends`
              : '[voice-agent] below capacity again; accepting new sessions',
          );
        }
        return load;
      },
      loadThreshold: 1,
    }),
  );
}
