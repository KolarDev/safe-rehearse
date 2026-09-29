import { randomUUID } from 'node:crypto';
import {
  AgentEventDecision,
  AgentSessionContext,
  CONTRACT_VERSION,
  type AgentEventEnvelope,
  type AgentEventPayload,
} from '@safe-rehearse/agent-contracts';
import type { z } from 'zod';

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

  sendEvent(attemptId: string, payload: AgentEventPayload): Promise<AgentEventDecision> {
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
    );
  }

  private async request<T extends z.ZodType>(
    path: string,
    schema: T,
    init: RequestInit = {},
  ): Promise<z.infer<T>> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(new URL(path, this.baseUrl), {
          ...init,
          headers: { authorization: `Bearer ${this.secret}`, 'content-type': 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) {
          // 4xx is a bug on our side or a missing attempt. Retrying will not help.
          const error = new Error(
            `${init.method ?? 'GET'} ${path} → ${response.status}: ${await response.text()}`,
          );
          if (response.status < 500) throw Object.assign(error, { permanent: true });
          throw error;
        }
        return schema.parse(await response.json());
      } catch (error) {
        if ((error as { permanent?: boolean }).permanent) throw error;
        lastError = error;
        if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
      }
    }
    throw lastError;
  }
}
