import * as google from '@livekit/agents-plugin-google';
import { z } from 'zod';
import type { VoiceModelProvider, VoiceModels } from './types.js';

const GeminiLiveEnv = z.object({
  GOOGLE_API_KEY: z.string().min(1, 'GOOGLE_API_KEY is required for VOICE_PROVIDER=gemini-live'),
  GEMINI_LIVE_MODEL: z.string().default('gemini-2.5-flash-native-audio-preview-12-2025'),
  GEMINI_LIVE_VOICE: z.string().default('Puck'),
});

/** Google Gemini Live: a speech-to-speech realtime model. */
export class GeminiLiveProvider implements VoiceModelProvider {
  readonly id = 'gemini-live';

  validate(): void {
    this.env();
  }

  createModels(): VoiceModels {
    const env = this.env();
    return {
      kind: 'realtime',
      llm: new google.realtime.RealtimeModel({
        apiKey: env.GOOGLE_API_KEY,
        model: env.GEMINI_LIVE_MODEL,
        voice: env.GEMINI_LIVE_VOICE,
        language: 'en-GB',
      }),
    };
  }

  private env() {
    const parsed = GeminiLiveEnv.safeParse(process.env);
    if (!parsed.success) throw new Error(z.prettifyError(parsed.error));
    return parsed.data;
  }
}
