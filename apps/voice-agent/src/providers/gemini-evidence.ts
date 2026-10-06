import { z } from 'zod';
import type {
  EvidenceExtractor,
  EvidenceFinding,
  TranscriptLine,
} from '../core/evidence-extractor.js';
import type { AgentSessionContext } from '@safe-rehearse/agent-contracts';

const GeminiEvidenceEnv = z.object({
  GOOGLE_API_KEY: z.string().min(1, 'GOOGLE_API_KEY is required for evidence extraction'),
  /** A text model, not a Live one. Pinned to a stable model so grading stays consistent. */
  GEMINI_EVIDENCE_MODEL: z.string().default('gemini-2.5-flash'),
  /**
   * Thinking budget in tokens for Gemini 2.5 models. Some reasoning improves the
   * judgement; a cap keeps the learner's wait at the end of the exam short.
   */
  GEMINI_EVIDENCE_THINKING_BUDGET: z.coerce.number().int().min(0).default(512),
  GEMINI_EVIDENCE_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
});

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_INSTRUCTION = `You assess the assessed part of a SafeRehearse training session for frontline social-care workers.

You receive assessment criteria and the numbered transcript of a role-play. AGENT is an examiner playing a character. LEARNER is the care worker being assessed. The transcript comes from speech recognition, so allow for small transcription errors and filler words.

For each criterion the LEARNER demonstrated, return one item:
- criterion_id: the criterion's id.
- learner_lines: the numbers of the LEARNER lines that show it. Never cite an AGENT line.
- confidence: from 0 to 1, how clearly those learner lines show the criterion.

Rules:
- Judge only what the LEARNER said. Never credit what the examiner said (for example, the examiner describing the abuse is not the learner recognising it), or what the learner might have meant but did not say.
- A criterion is met only if EVERY part of its description is shown. If only part is shown (for example, they say they will pass it on but never say why), give a confidence below 0.5.
- Vague words are weak evidence. "I'll pass you to someone" is not the same as naming a manager or safeguarding lead.
- If the learner contradicted a criterion (for example, agreed to keep a secret), do not return it.
- Omit criteria the learner did not demonstrate. Returning nothing is a valid answer.
- At most one item per criterion: pick the clearest evidence.`;

const Response = z.object({
  evidence: z.array(
    z.object({
      criterion_id: z.string(),
      learner_lines: z.array(z.number().int()),
      confidence: z.number(),
    }),
  ),
});

/** Evidence extraction with a Gemini text model, over the REST API (no SDK needed). */
export class GeminiEvidenceExtractor implements EvidenceExtractor {
  readonly id = 'gemini-text';

  validate(): void {
    this.env();
  }

  async extract({
    context,
    transcript,
  }: {
    context: AgentSessionContext;
    transcript: TranscriptLine[];
  }): Promise<EvidenceFinding[]> {
    const env = this.env();
    const ids = context.criteria.map((c) => c.id);
    if (ids.length === 0) return [];

    const response = await fetch(`${API_URL}/${env.GEMINI_EVIDENCE_MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GOOGLE_API_KEY },
      signal: AbortSignal.timeout(env.GEMINI_EVIDENCE_TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: buildPrompt(context, transcript) }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              evidence: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    criterion_id: { type: 'STRING', enum: ids },
                    learner_lines: { type: 'ARRAY', items: { type: 'INTEGER' } },
                    confidence: { type: 'NUMBER' },
                  },
                  required: ['criterion_id', 'learner_lines', 'confidence'],
                },
              },
            },
            required: ['evidence'],
          },
          ...(env.GEMINI_EVIDENCE_MODEL.startsWith('gemini-2.5')
            ? { thinkingConfig: { thinkingBudget: env.GEMINI_EVIDENCE_THINKING_BUDGET } }
            : {}),
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Gemini ${env.GEMINI_EVIDENCE_MODEL} → ${response.status}: ${body.slice(0, 300)}`,
      );
    }
    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const text = (data.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought && p.text)
      .map((p) => p.text)
      .join('');
    if (!text) throw new Error('Gemini returned no answer');

    // The model cites line numbers and the evidence becomes the learner's exact words.
    // Citations of AGENT lines (or of lines that don't exist) are discarded, so the
    // examiner's words can never count as the learner's.
    const parsed = Response.parse(JSON.parse(text));
    const known = new Set(ids);
    const findings: EvidenceFinding[] = [];
    for (const item of parsed.evidence) {
      if (!known.has(item.criterion_id)) continue;
      if (findings.some((f) => f.criterionId === item.criterion_id)) continue;
      const cited = [...new Set(item.learner_lines)]
        .sort((a, b) => a - b)
        .map((n) => transcript[n - 1])
        .filter((line): line is TranscriptLine => line?.speaker === 'LEARNER');
      if (cited.length === 0) continue;
      findings.push({
        criterionId: item.criterion_id,
        evidence: cited.map((line) => line.text.trim()).join(' … '),
        confidence: Math.min(1, Math.max(0, item.confidence)),
      });
    }
    return findings;
  }

  private env() {
    const parsed = GeminiEvidenceEnv.safeParse(process.env);
    if (!parsed.success) throw new Error(z.prettifyError(parsed.error));
    return parsed.data;
  }
}

function buildPrompt(context: AgentSessionContext, transcript: TranscriptLine[]): string {
  const criteria = context.criteria.map((c) => `- ${c.id}: ${c.description}`).join('\n');
  const lines = transcript.map((l, i) => `[${i + 1}] ${l.speaker}: ${l.text}`).join('\n');
  return [
    `Scenario: ${context.stage.scenarioTitle}`,
    `Stage: ${context.stage.title}`,
    `Criteria:\n${criteria}`,
    `Transcript of the assessed role-play:\n${lines}`,
  ].join('\n\n');
}
