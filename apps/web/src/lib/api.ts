import {
  AttemptSnapshot,
  StageSummary,
  VoiceSessionResponse,
  type StartAttemptRequest,
} from '@safe-rehearse/types';
import { z } from 'zod';
import { createLogger } from './log';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const log = createLogger('api');

/** An API failure with a readable message (taken from the Nest error body when present). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T extends z.ZodType>(
  schema: T,
  path: string,
  options: { body?: unknown; quiet?: boolean } = {},
): Promise<z.infer<T>> {
  const method = options.body === undefined ? 'GET' : 'POST';
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    log.error(`${method} ${path} failed: API unreachable at ${API_URL}`, error);
    throw new ApiError(`Cannot reach the SafeRehearse API at ${API_URL}. Is it running?`, 0);
  }

  const ms = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    const text = await response.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      if (typeof parsed.message === 'string') message = parsed.message;
    } catch {
      // not JSON; keep the raw text
    }
    log.error(`${method} ${path} → ${response.status} (${ms}ms): ${message}`);
    throw new ApiError(message || `Request failed with ${response.status}`, response.status);
  }

  const data = schema.parse(await response.json());
  if (options.quiet) log.debug(`${method} ${path} → ${response.status} (${ms}ms)`);
  else log.info(`${method} ${path} → ${response.status} (${ms}ms)`, data);
  return data;
}

export const api = {
  listStages: () => request(z.array(StageSummary), '/stages'),
  startAttempt: (body: StartAttemptRequest) =>
    request(AttemptSnapshot, '/stage-attempts', { body }),
  /** Polled every 2s during a session, so logged at debug level. */
  getAttempt: (id: string) => request(AttemptSnapshot, `/stage-attempts/${id}`, { quiet: true }),
  startVoiceSession: (id: string) =>
    request(VoiceSessionResponse, `/stage-attempts/${id}/voice-session`, { body: {} }),
  abandon: (id: string) => request(AttemptSnapshot, `/stage-attempts/${id}/abandon`, { body: {} }),
  /** Best-effort drop when the tab closes. The agent also reports the disconnect. */
  abandonOnUnload: (id: string) => {
    log.warn(`page closing; abandoning attempt ${id}`);
    return navigator.sendBeacon(`${API_URL}/stage-attempts/${id}/abandon`);
  },
};
