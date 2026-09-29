-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "StageMode" AS ENUM ('TEACHER', 'PRACTICE_PARTNER', 'EXAMINER');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'DROPPED', 'PASSED', 'FAILED');

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stage" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "learningObjectives" TEXT[],
    "teacherInstructions" TEXT NOT NULL,
    "practiceInstructions" TEXT NOT NULL,
    "examinerInstructions" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentCriterion" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,

    CONSTRAINT "AssessmentCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageAttempt" (
    "id" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "learnerRef" TEXT NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "mode" "StageMode" NOT NULL DEFAULT 'TEACHER',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "voiceSessionIssuedAt" TIMESTAMP(3),
    "teacherCompletedAt" TIMESTAMP(3),
    "practiceCompletedAt" TIMESTAMP(3),
    "examinerCompletedAt" TIMESTAMP(3),

    CONSTRAINT "StageAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentEvent" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "rejectionReason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "mode" "StageMode" NOT NULL,
    "text" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterionResult" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "met" BOOLEAN NOT NULL,

    CONSTRAINT "CriterionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Scenario_slug_key" ON "Scenario"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Stage_scenarioId_position_key" ON "Stage"("scenarioId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentCriterion_stageId_key_key" ON "AssessmentCriterion"("stageId", "key");

-- CreateIndex
CREATE INDEX "StageAttempt_learnerRef_stageId_idx" ON "StageAttempt"("learnerRef", "stageId");

-- CreateIndex
CREATE INDEX "AgentEvent_attemptId_occurredAt_idx" ON "AgentEvent"("attemptId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CriterionResult_attemptId_criterionId_key" ON "CriterionResult"("attemptId", "criterionId");

-- AddForeignKey
ALTER TABLE "Stage" ADD CONSTRAINT "Stage_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentCriterion" ADD CONSTRAINT "AssessmentCriterion_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeChunk" ADD CONSTRAINT "KnowledgeChunk_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageAttempt" ADD CONSTRAINT "StageAttempt_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "Stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentEvent" ADD CONSTRAINT "AgentEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "StageAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "StageAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "AssessmentCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "StageAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "AssessmentCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
