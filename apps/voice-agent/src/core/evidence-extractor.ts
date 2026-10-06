import type { AgentSessionContext } from '@safe-rehearse/agent-contracts';

/**
 * Finds assessment evidence in the transcript of the assessed role-play, after
 * it ends. Evidence used to be recorded by the voice model mid-conversation, but
 * Gemini Live reliably crashes (1011) when it calls a tool while in character,
 * and judging the whole exam at once is the better assessment anyway.
 *
 * The extractor only REPORTS evidence. The backend still applies its confidence
 * thresholds and decides the result.
 */
export interface TranscriptLine {
  speaker: 'LEARNER' | 'AGENT';
  text: string;
}

export interface EvidenceFinding {
  criterionId: string;
  /** What the learner said, quoted or closely paraphrased. */
  evidence: string;
  /** How clearly this shows the criterion, from 0 to 1. */
  confidence: number;
}

export interface EvidenceExtractor {
  readonly id: string;
  /** Throws if it cannot produce an answer; the caller decides what that means. */
  extract(input: {
    context: AgentSessionContext;
    transcript: TranscriptLine[];
  }): Promise<EvidenceFinding[]>;
}
