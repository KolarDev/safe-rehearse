import { randomUUID } from 'node:crypto';
import {
  AgentEventDecision,
  AgentSessionContext,
  CONTRACT_VERSION,
  type AgentEventEnvelope,
  type AgentEventPayload,
} from '@safe-rehearse/agent-contracts';
import type { z } from 'zod';
import { createLogger, errorFields } from './logger.js';

const log = createLogger('backend-client');
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

/**
 * The agent's only channel into SafeRehearse. Speaks agent-contracts, nothing else.
 * Events carry a UUID, so retrying after a network error is safe: the backend
 * deduplicates.
 */
export class BackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  getContext(attemptId: string): Promise<AgentSessionContext> {
    return this.request(
      `/agent/attempts/${encodeURIComponent(attemptId)}/context`,
      AgentSessionContext,
    );
  }

  /** `maxAttempts` defaults to 3; best-effort events (transcripts) pass 1. */
  sendEvent(
    attemptId: string,
    payload: AgentEventPayload,
    options: { maxAttempts?: number } = {},
  ): Promise<AgentEventDecision> {
    const envelope: AgentEventEnvelope = {
      contractVersion: CONTRACT_VERSION,
      eventId: randomUUID(),
      attemptId,
      occurredAt: new Date().toISOString(),
      payload,
    };
    return this.request(
      `/agent/attempts/${encodeURIComponent(attemptId)}/events`,
      AgentEventDecision,
      {
        method: 'POST',
        body: JSON.stringify(envelope),
      },
      options.maxAttempts,
    );
  }

  private async request<T extends z.ZodType>(
    path: string,
    schema: T,
    init: RequestInit = {},
    maxAttempts = MAX_ATTEMPTS,
  ): Promise<z.infer<T>> {
    const method = init.method ?? 'GET';
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const startedAt = Date.now();
      try {
        const response = await fetch(new URL(path, this.baseUrl), {
          ...init,
          headers: { authorization: `Bearer ${this.secret}`, 'content-type': 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
          // 4xx is a bug on our side or a missing attempt. Retrying will not help.
          const error = new Error(
            `${method} ${path} → ${response.status}: ${await response.text()}`,
          );
          if (response.status < 500) throw Object.assign(error, { permanent: true });
          throw error;
        }
        const body = schema.parse(await response.json());
        log.debug('backend request ok', { method, path, ms: Date.now() - startedAt, attempt });
        return body;
      } catch (error) {
        const fields = { method, path, attempt, ms: Date.now() - startedAt, ...errorFields(error) };
        if ((error as { permanent?: boolean }).permanent) {
          log.error('backend request rejected (not retrying)', fields);
          throw error;
        }
        lastError = error;
        if (attempt < maxAttempts) {
          log.warn('backend request failed, retrying', fields);
          await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
        } else {
          log.error('backend request failed after all retries', fields);
        }
      }
    }
    throw lastError;
  }
}
