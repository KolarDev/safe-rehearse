import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// App-local .env first, then the monorepo root .env.
loadDotenv({ path: [resolve('.env'), resolve('../../.env')], quiet: true });

// LiveKit's event-loop watchdog warns on every stall over 100ms and attaches a
// debugger to sample stacks. On a busy dev machine that floods the console and adds
// load. Defaults here (overridable in .env): warn only from 1s, never sample stacks.
process.env['LIVEKIT_AGENTS_LOOP_BLOCK_WARN_MS'] ??= '1000';
process.env['LIVEKIT_AGENTS_LOOP_BLOCK_ERROR_MS'] ??= '3000';
process.env['LIVEKIT_AGENTS_LOOP_BLOCK_STACKS'] ??= 'never';

const Config = z.object({
  SAFE_REHEARSE_API_URL: z.url().default('http://localhost:4000'),
  AGENT_API_SECRET: z.string().min(16, 'AGENT_API_SECRET must be at least 16 characters'),
  LIVEKIT_AGENT_NAME: z.string().default('safe-rehearse-agent'),
  VOICE_PROVIDER: z.string().default('gemini-live'),
  /** Concurrent voice sessions this worker accepts before LiveKit stops dispatching to it. */
  AGENT_MAX_SESSIONS: z.coerce.number().int().positive().default(4),
});
export type Config = z.infer<typeof Config>;

export function loadConfig(): Config {
  const parsed = Config.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid voice-agent environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
