import {
  AttemptSnapshot,
  StageSummary,
  VoiceSessionResponse,
  type StartAttemptRequest,
} from '@safe-rehearse/types';
import { z } from 'zod';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function request<T extends z.ZodType>(
  schema: T,
  path: string,
  body?: unknown,
): Promise<z.infer<T>> {
  const response = await fetch(`${API_URL}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${response.status}: ${await response.text()}`);
  }
  return schema.parse(await response.json());
}

export const api = {
  listStages: () => request(z.array(StageSummary), '/stages'),
  startAttempt: (body: StartAttemptRequest) => request(AttemptSnapshot, '/stage-attempts', body),
  getAttempt: (id: string) => request(AttemptSnapshot, `/stage-attempts/${id}`),
  startVoiceSession: (id: string) =>
    request(VoiceSessionResponse, `/stage-attempts/${id}/voice-session`, {}),
  abandon: (id: string) => request(AttemptSnapshot, `/stage-attempts/${id}/abandon`, {}),
  /** Best-effort drop when the tab closes. The agent also reports the disconnect. */
  abandonOnUnload: (id: string) => navigator.sendBeacon(`${API_URL}/stage-attempts/${id}/abandon`),
};
