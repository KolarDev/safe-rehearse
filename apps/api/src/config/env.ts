import { z } from 'zod';

export const Env = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  /** Shared secret the voice agent presents as a Bearer token on /agent/* routes. */
  AGENT_API_SECRET: z.string().min(16, 'AGENT_API_SECRET must be at least 16 characters'),

  LIVEKIT_URL: z.string().min(1),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  /** Must match the name the voice-agent worker registers with. */
  LIVEKIT_AGENT_NAME: z.string().default('safe-rehearse-agent'),
});
export type Env = z.infer<typeof Env>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = Env.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid API environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
