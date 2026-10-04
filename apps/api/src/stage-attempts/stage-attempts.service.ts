import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  AgentEventDecision,
  AgentEventEnvelope,
  AgentEventPayload,
  AttemptSnapshot,
  RejectionReason,
} from '@safe-rehearse/agent-contracts';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assess } from './domain/assessment.js';
import {
  decideEvidence,
  decideRecord,
  decideSessionEnd,
  decideTransition,
  type AttemptState,
  type Verdict,
} from './domain/stage-attempt.machine.js';

type Tx = Prisma.TransactionClient;

const logger = new Logger('StageAttempts');

const COMPLETED_AT_FIELD = {
  TEACHER: 'teacherCompletedAt',
  PRACTICE_PARTNER: 'practiceCompletedAt',
  EXAMINER: 'examinerCompletedAt',
} as const;

const snapshotInclude = {
  results: { include: { criterion: { select: { key: true, description: true, position: true } } } },
} satisfies Prisma.StageAttemptInclude;

type AttemptWithResults = Prisma.StageAttemptGetPayload<{ include: typeof snapshotInclude }>;

@Injectable()
export class StageAttemptsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Starts a fresh attempt. This is also how a learner retries: any attempt of the
   * same stage still in progress is dropped first, so nothing carries over.
   */
  async start(stageId: string, learnerRef: string): Promise<AttemptSnapshot> {
    const { attempt, superseded } = await this.prisma.$transaction(async (tx) => {
      const stage = await tx.stage.findUnique({ where: { id: stageId }, select: { id: true } });
      if (!stage) {
        logger.warn(`start refused: stage ${stageId} not found (learner ${learnerRef})`);
        throw new NotFoundException(`Stage ${stageId} not found`);
      }

      const { count } = await tx.stageAttempt.updateMany({
        where: { stageId, learnerRef, status: 'IN_PROGRESS' },
        data: { status: 'DROPPED', endedAt: new Date(), endReason: 'superseded' },
      });
      const created = await tx.stageAttempt.create({
        data: { stageId, learnerRef },
        include: snapshotInclude,
      });
      return { attempt: created, superseded: count };
    });
    if (superseded > 0) {
      logger.warn(
        `dropped ${superseded} in-progress attempt(s) superseded by retry (learner ${learnerRef})`,
      );
    }
    logger.log(`attempt ${attempt.id} started (stage ${stageId}, learner ${learnerRef})`);
    return toSnapshot(attempt);
  }

  async get(attemptId: string): Promise<AttemptSnapshot> {
    const attempt = await this.prisma.stageAttempt.findUnique({
      where: { id: attemptId },
      include: snapshotInclude,
    });
    if (!attempt) throw new NotFoundException(`Attempt ${attemptId} not found`);
    return toSnapshot(attempt);
  }

  /** The learner left from the web client. Drops the attempt if it is still in progress. */
  async abandon(attemptId: string): Promise<AttemptSnapshot> {
    await this.prisma.$transaction(async (tx) => {
      const attempt = await lockAttempt(tx, attemptId);
      if (!attempt) throw new NotFoundException(`Attempt ${attemptId} not found`);
      if (decideSessionEnd(attempt) === 'DROP') {
        await drop(tx, attemptId, 'participant_left');
      } else {
        logger.debug(`abandon ignored: attempt ${attemptId} is already ${attempt.status}`);
      }
    });
    return this.get(attemptId);
  }

  /**
   * Applies one agent event. Every event is logged; only events the rules accept
   * change state. Redelivered events (same eventId) return the original verdict.
   */
  async applyAgentEvent(envelope: AgentEventEnvelope): Promise<AgentEventDecision> {
    const { attemptId, payload } = envelope;

    const label = describeEvent(payload);
    let outcome: Verdict<null>;
    try {
      outcome = await this.applyInTransaction(envelope);
    } catch (error) {
      logger.error(
        `[${attemptId}] failed to apply ${label}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }

    if (outcome.ok) {
      if (payload.type === 'transcript') logger.debug(`[${attemptId}] accepted ${label}`);
      else logger.log(`[${attemptId}] accepted ${label}`);
      return { accepted: true, attempt: await this.get(attemptId) };
    }
    logger.warn(`[${attemptId}] rejected ${label}: ${outcome.reason} (${outcome.message})`);
    const attempt = outcome.reason === 'ATTEMPT_NOT_FOUND' ? null : await this.get(attemptId);
    return { accepted: false, reason: outcome.reason, message: outcome.message, attempt };
  }

  private applyInTransaction(envelope: AgentEventEnvelope): Promise<Verdict<null>> {
    const { eventId, attemptId, payload } = envelope;
    return this.prisma.$transaction(async (tx) => {
      const attempt = await lockAttempt(tx, attemptId);
      if (!attempt) {
        return rejected('ATTEMPT_NOT_FOUND', `Attempt ${attemptId} does not exist.`);
      }

      const previous = await tx.agentEvent.findUnique({ where: { id: eventId } });
      if (previous) {
        logger.debug(`[${attemptId}] duplicate event ${eventId}; returning original verdict`);
        return previous.accepted
          ? accepted
          : rejected(
              previous.rejectionReason as RejectionReason,
              'Duplicate event; the original was rejected.',
            );
      }

      const verdict = await applyPayload(tx, attempt, payload);
      await tx.agentEvent.create({
        data: {
          id: eventId,
          attemptId,
          type: payload.type,
          payload: payload as Prisma.InputJsonValue,
          accepted: verdict.ok,
          rejectionReason: verdict.ok ? null : verdict.reason,
          occurredAt: new Date(envelope.occurredAt),
        },
      });
      return verdict.ok ? accepted : rejected(verdict.reason, verdict.message);
    });
  }
}

function describeEvent(payload: AgentEventPayload): string {
  switch (payload.type) {
    case 'transcript':
      return `transcript (${payload.speaker}, ${payload.mode})`;
    case 'evidence':
      return `evidence for "${payload.criterionId}" (confidence ${payload.confidence})`;
    case 'stage_transition_requested':
      return `transition ${payload.from} → ${payload.to}`;
    case 'feedback':
      return `feedback (${payload.mode})`;
    case 'session':
      return payload.event === 'ended' ? `session ended (${payload.reason})` : 'session started';
  }
}

const accepted = { ok: true, value: null } as const;
const rejected = (reason: RejectionReason, message: string) =>
  ({ ok: false, reason, message }) as const;

interface LockedAttempt extends AttemptState {
  id: string;
  stageId: string;
}

/** Serialises concurrent events for one attempt so the rules always see current state. */
async function lockAttempt(tx: Tx, attemptId: string): Promise<LockedAttempt | null> {
  const rows = await tx.$queryRaw<LockedAttempt[]>`
    SELECT id, "stageId", status, mode FROM "StageAttempt" WHERE id = ${attemptId} FOR UPDATE`;
  return rows[0] ?? null;
}

async function applyPayload(
  tx: Tx,
  attempt: LockedAttempt,
  payload: AgentEventPayload,
): Promise<Verdict<null>> {
  switch (payload.type) {
    case 'transcript':
    case 'feedback':
      return decideRecord(attempt, payload.mode);

    case 'evidence': {
      const verdict = decideEvidence(attempt, payload.mode);
      if (!verdict.ok) return verdict;

      const criterion = await tx.assessmentCriterion.findUnique({
        where: { stageId_key: { stageId: attempt.stageId, key: payload.criterionId } },
        select: { id: true },
      });
      if (!criterion) {
        return rejected(
          'UNKNOWN_CRITERION',
          `"${payload.criterionId}" is not a criterion of this stage.`,
        );
      }
      await tx.evidence.create({
        data: {
          attemptId: attempt.id,
          criterionId: criterion.id,
          mode: payload.mode,
          text: payload.evidence,
          confidence: payload.confidence,
          occurredAt: new Date(),
        },
      });
      return accepted;
    }

    case 'stage_transition_requested': {
      const verdict = decideTransition(attempt, payload);
      if (!verdict.ok) return verdict;

      const now = new Date();
      if (verdict.value === 'ASSESSMENT') {
        await grade(tx, attempt, now);
      } else {
        await tx.stageAttempt.update({
          where: { id: attempt.id },
          data: { mode: verdict.value, [COMPLETED_AT_FIELD[attempt.mode]]: now },
        });
        logger.log(`[${attempt.id}] mode advanced ${attempt.mode} → ${verdict.value}`);
      }
      return accepted;
    }

    case 'session':
      if (payload.event === 'started') {
        return attempt.status === 'IN_PROGRESS'
          ? accepted
          : rejected('ATTEMPT_NOT_IN_PROGRESS', `This attempt is ${attempt.status}.`);
      }
      if (decideSessionEnd(attempt) === 'DROP') {
        await drop(tx, attempt.id, payload.reason);
      }
      return accepted;
  }
}

async function grade(tx: Tx, attempt: LockedAttempt, now: Date) {
  const [criteria, evidence] = await Promise.all([
    tx.assessmentCriterion.findMany({
      where: { stageId: attempt.stageId },
      select: { id: true, required: true, minConfidence: true },
    }),
    tx.evidence.findMany({
      where: { attemptId: attempt.id },
      select: { criterionId: true, mode: true, confidence: true },
    }),
  ]);
  const assessment = assess(criteria, evidence);
  const met = assessment.criteria.filter((c) => c.met).length;
  logger.log(
    `[${attempt.id}] graded ${assessment.passed ? 'PASSED' : 'FAILED'}: ` +
      `${met}/${criteria.length} criteria met from ${evidence.length} evidence item(s)`,
  );

  await tx.criterionResult.createMany({
    data: assessment.criteria.map((result) => ({ attemptId: attempt.id, ...result })),
  });
  await tx.stageAttempt.update({
    where: { id: attempt.id },
    data: {
      status: assessment.passed ? 'PASSED' : 'FAILED',
      examinerCompletedAt: now,
      endedAt: now,
      endReason: 'graded',
    },
  });
}

async function drop(tx: Tx, attemptId: string, reason: string) {
  logger.warn(`[${attemptId}] attempt DROPPED (${reason})`);
  await tx.stageAttempt.update({
    where: { id: attemptId },
    data: { status: 'DROPPED', endedAt: new Date(), endReason: reason },
  });
}

function toSnapshot(attempt: AttemptWithResults): AttemptSnapshot {
  const graded = attempt.status === 'PASSED' || attempt.status === 'FAILED';
  return {
    id: attempt.id,
    stageId: attempt.stageId,
    status: attempt.status,
    mode: attempt.mode,
    startedAt: attempt.startedAt.toISOString(),
    endedAt: attempt.endedAt?.toISOString() ?? null,
    result: graded
      ? {
          criteria: attempt.results
            .sort((a, b) => a.criterion.position - b.criterion.position)
            .map((r) => ({
              criterionId: r.criterion.key,
              description: r.criterion.description,
              met: r.met,
            })),
        }
      : null,
  };
}
