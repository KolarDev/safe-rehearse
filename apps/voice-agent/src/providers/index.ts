import { GeminiEvidenceExtractor } from './gemini-evidence.js';
import { GeminiLiveProvider } from './gemini-live.js';
import type { VoiceModelProvider } from './types.js';

export type { VoiceModelProvider, VoiceModels } from './types.js';

/** Register new providers here, e.g. 'openai-realtime' or a local STT → LLM → TTS pipeline. */
const PROVIDERS: Record<string, () => VoiceModelProvider> = {
  'gemini-live': () => new GeminiLiveProvider(),
};

export function selectProvider(id: string): VoiceModelProvider {
  const create = PROVIDERS[id];
  if (!create) {
    throw new Error(
      `Unknown VOICE_PROVIDER "${id}". Available: ${Object.keys(PROVIDERS).join(', ')}`,
    );
  }
  return create();
}

/** Evidence extraction for the assessed part. One implementation for now. */
export function createEvidenceExtractor(): GeminiEvidenceExtractor {
  return new GeminiEvidenceExtractor();
}
