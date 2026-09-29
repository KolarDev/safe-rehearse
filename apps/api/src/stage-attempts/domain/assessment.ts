import type { StageMode } from '@safe-rehearse/agent-contracts';

/**
 * Deterministic grading. The AI supplies evidence; these expert-configured rules
 * decide whether each criterion is met and whether the attempt passes.
 */

export interface CriterionRule {
  id: string;
  required: boolean;
  minConfidence: number;
}

export interface EvidenceItem {
  criterionId: string;
  mode: StageMode;
  confidence: number;
}

export interface Assessment {
  passed: boolean;
  criteria: { criterionId: string; met: boolean }[];
}

export function assess(criteria: CriterionRule[], evidence: EvidenceItem[]): Assessment {
  const results = criteria.map((criterion) => ({
    criterionId: criterion.id,
    met: evidence.some(
      (item) =>
        item.criterionId === criterion.id &&
        item.mode === 'EXAMINER' &&
        item.confidence >= criterion.minConfidence,
    ),
  }));

  const passed = criteria.every(
    (criterion) => !criterion.required || results.find((r) => r.criterionId === criterion.id)?.met,
  );

  return { passed, criteria: results };
}
