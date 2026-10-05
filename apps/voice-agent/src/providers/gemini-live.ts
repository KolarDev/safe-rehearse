import * as google from '@livekit/agents-plugin-google';
import { z } from 'zod';
import type { VoiceModelProvider, VoiceModels } from './types.js';

const GeminiLiveEnv = z.object({
  GOOGLE_API_KEY: z.string().min(1, 'GOOGLE_API_KEY is required for VOICE_PROVIDER=gemini-live'),
  GEMINI_LIVE_MODEL: z.string().default('gemini-2.5-flash-native-audio-preview-12-2025'),
  GEMINI_LIVE_VOICE: z.string().default('Puck'),
  /**
   * Optional BCP-47 code. Leave unset for native-audio models: they detect the
   * language themselves and reject codes such as en-GB.
   */
  GEMINI_LIVE_LANGUAGE: z.string().optional(),
  /**
   * Thinking budget in tokens for Gemini 2.5 live models. Thinking adds latency to
   * every reply, which a voice tutor feels; it defaults to 0 (off) for 2.5 models.
   * Set e.g. 512 to turn it back on. Ignored for other model families.
   */
  GEMINI_LIVE_THINKING_BUDGET: z.coerce.number().int().min(0).optional(),
});

/** Google Gemini Live: a speech-to-speech realtime model. */
export class GeminiLiveProvider implements VoiceModelProvider {
  readonly id = 'gemini-live';

  validate(): void {
    this.env();
  }

  createModels(): VoiceModels {
    const env = this.env();
    const isGemini25 = env.GEMINI_LIVE_MODEL.startsWith('gemini-2.5');
    const thinkingBudget = env.GEMINI_LIVE_THINKING_BUDGET ?? 0;
    return {
      kind: 'realtime',
      llm: new google.realtime.RealtimeModel({
        apiKey: env.GOOGLE_API_KEY,
        model: env.GEMINI_LIVE_MODEL,
        voice: env.GEMINI_LIVE_VOICE,
        ...(env.GEMINI_LIVE_LANGUAGE ? { language: env.GEMINI_LIVE_LANGUAGE } : {}),
        ...(isGemini25 ? { thinkingConfig: { thinkingBudget } } : {}),
      }),
    };
  }

  private env() {
    const parsed = GeminiLiveEnv.safeParse(process.env);
    if (!parsed.success) throw new Error(z.prettifyError(parsed.error));
    return parsed.data;
  }
}
