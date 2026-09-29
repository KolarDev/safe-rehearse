import type { llm, stt, tts, VAD } from '@livekit/agents';

/**
 * The model components for one voice session. Either a speech-to-speech
 * realtime model on its own, or an STT → LLM → TTS pipeline.
 */
export type VoiceModels =
  | { kind: 'realtime'; llm: llm.RealtimeModel }
  | { kind: 'pipeline'; stt: stt.STT; llm: llm.LLM; tts: tts.TTS; vad?: VAD };

/**
 * A replaceable voice model provider. Adding a provider means adding one
 * implementation and registering it. Nothing outside src/providers changes.
 */
export interface VoiceModelProvider {
  readonly id: string;
  /** Throws early, at worker start, if required configuration is missing. */
  validate(): void;
  createModels(): VoiceModels;
}
