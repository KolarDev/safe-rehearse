import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// App-local .env first, then the monorepo root .env.
loadDotenv({ path: [resolve('.env'), resolve('../../.env')], quiet: true });

const Config = z.object({
  SAFE_REHEARSE_API_URL: z.url().default('http://localhost:4000'),
  AGENT_API_SECRET: z.string().min(16, 'AGENT_API_SECRET must be at least 16 characters'),
  LIVEKIT_AGENT_NAME: z.string().default('safe-rehearse-agent'),
  VOICE_PROVIDER: z.string().default('gemini-live'),
});
export type Config = z.infer<typeof Config>;

export function loadConfig(): Config {
  const parsed = Config.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid voice-agent environment:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
