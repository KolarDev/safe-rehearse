// Preflight for `pnpm cloud`: make sure .env points at LiveKit Cloud, not the local dev
// server, before starting web + api + voice-agent. Exits non-zero with a clear message.
import { existsSync, readFileSync } from 'node:fs';

const ENV_FILE = '.env';

function readEnv(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = { ...readEnv(ENV_FILE), ...process.env };
const url = env.LIVEKIT_URL ?? '';
const problems = [];

if (!url) problems.push('LIVEKIT_URL is not set.');
else if (!url.startsWith('wss://'))
  problems.push(`LIVEKIT_URL should start with wss:// (got "${url}").`);
if (/localhost|127\.0\.0\.1/.test(url))
  problems.push('LIVEKIT_URL points at the local dev server.');
if (!env.LIVEKIT_API_KEY || env.LIVEKIT_API_KEY === 'devkey') {
  problems.push('LIVEKIT_API_KEY is missing or still the local dev key ("devkey").');
}
if (!env.LIVEKIT_API_SECRET || env.LIVEKIT_API_SECRET === 'secret') {
  problems.push('LIVEKIT_API_SECRET is missing or still the local dev secret ("secret").');
}
if (!env.GOOGLE_API_KEY && (env.VOICE_PROVIDER ?? 'gemini-live') === 'gemini-live') {
  problems.push('GOOGLE_API_KEY is not set (needed by the Gemini Live provider).');
}

if (problems.length > 0) {
  console.error('\n✘ Not ready for LiveKit Cloud:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error(
    '\nSet the values from your LiveKit Cloud project (Settings → Keys) in .env.\n' +
      'See docs/livekit-cloud.md. To use the local LiveKit server instead: pnpm infra:up:livekit && pnpm lite\n',
  );
  process.exit(1);
}

console.log(`✔ LiveKit Cloud: ${url}`);
