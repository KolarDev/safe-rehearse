import { Injectable, NotFoundException } from '@nestjs/common';
import type { AgentSessionContext } from '@safe-rehearse/agent-contracts';
import { KnowledgeService } from '../course/knowledge.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StageAttemptsService } from '../stage-attempts/stage-attempts.service.js';

/** Assembles everything an agent needs for one attempt, from backend-owned data. */
@Injectable()
export class AgentContextService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attempts: StageAttemptsService,
    private readonly knowledge: KnowledgeService,
  ) {}

  async forAttempt(attemptId: string): Promise<AgentSessionContext> {
    const attempt = await this.attempts.get(attemptId);
    const stage = await this.prisma.stage.findUnique({
      where: { id: attempt.stageId },
      include: {
        scenario: { select: { title: true } },
        criteria: { orderBy: { position: 'asc' }, select: { key: true, description: true } },
      },
    });
    if (!stage) throw new NotFoundException(`Stage ${attempt.stageId} not found`);

    return {
      attempt,
      stage: {
        id: stage.id,
        title: stage.title,
        scenarioTitle: stage.scenario.title,
        learningObjectives: stage.learningObjectives,
      },
      knowledge: await this.knowledge.forStage(stage.id),
      modes: [
        { mode: 'TEACHER', instructions: stage.teacherInstructions },
        { mode: 'PRACTICE_PARTNER', instructions: stage.practiceInstructions },
        { mode: 'EXAMINER', instructions: stage.examinerInstructions },
      ],
      criteria: stage.criteria.map((c) => ({ id: c.key, description: c.description })),
    };
  }
}
