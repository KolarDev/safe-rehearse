# SafeRehearse Architecture

> **Status: PLANNED.** Everything in this document describes the _intended_ architecture.
> As of Phase 0, **none of it is implemented**. The repository contains only the monorepo foundation,
> framework bootstraps, and tooling.

## 1. Product overview

SafeRehearse is an AI learning and practice platform, initially for frontline social-care training.

- **Phase 1: Interactive learning.** An AI Teacher teaches training material through live voice interaction.
- **Phase 2: Scenario practice & assessment.** Scenarios are divided into **stages**. Every stage runs through
  three voice-based modes:

  | Mode                 | Intent                                     |
  | -------------------- | ------------------------------------------ |
  | **Teacher**          | "Let me teach you this."                   |
  | **Practice Partner** | "Let's practise this situation."           |
  | **Examiner**         | "I'm going to assess how you handle this." |

  The Examiner portion produces a structured grade against predefined assessment criteria.

## 2. System layers (planned)

```text
Web Client            apps/web: Next.js, React, Tailwind
    ↓
NestJS API            apps/api: HTTP/realtime entry point, session authority
    ↓
Application / Domain Logic        stages, attempts, assessment rules, grading
    ↓
PostgreSQL                        system of record (via Prisma), pgvector for retrieval
    ↓
Redis / BullMQ                    jobs, async processing, ephemeral session state
```

### PostgreSQL + pgvector

PostgreSQL is the single system of record, accessed through Prisma (`prisma/schema.prisma`).
Training-content retrieval will use the **`pgvector`** extension in the same PostgreSQL database.
**No separate vector database** is planned. Vector search is not implemented yet.

### Redis + BullMQ

Redis, with BullMQ for queues, is intended for:

- background jobs and asynchronous processing, such as post-session assessment and feedback generation
- queues
- temporary or ephemeral session state
- rate limiting

`bullmq` and `@nestjs/bullmq` are installed in `apps/api`. No queues, workers, or connections exist yet.
Redis is **not** a system of record. Anything that must persist goes to PostgreSQL.

## 3. AI interaction flow (planned)

```text
Teacher
Practice Partner
Examiner
      ↓
Realtime Voice Layer
      ↓
Assessment Engine
      ↓
Feedback / Grading
      ↓
Learner Progress
```

Planned engines, none of them implemented yet: Teacher Engine, Practice/Scenario Engine, Assessment Engine,
Feedback Engine, Grading Engine, Learner Progress / Competency tracking, and realtime voice interaction.
The AI and realtime voice providers have not been chosen. `.env.example` holds provider-neutral placeholders.

## 4. Architectural principles

These principles guide all future implementation.

### Principle 1: Stage is the atomic learning unit

A stage contains the following, all within one voice-based learning session:

```text
Teacher → Practice Partner → Examiner → Result
```

A learner can complete a stage independently and continue the scenario from later stages.

### Principle 2: StageAttempt is the execution of a stage

A learner may make several attempts at a stage:

```text
Attempt 1 → DROPPED
Attempt 2 → FAILED
Attempt 3 → PASSED
```

### Principle 3: Dropped attempts are not graded

If a stage is interrupted by an error, a network failure, a closed browser, the learner leaving, or any other
session failure, the current attempt is marked **`DROPPED`**. A dropped attempt does not count
toward learner performance.

### Principle 4: Retry creates a fresh attempt

Retry starts a **new StageAttempt** and resets the learner's stage experience. The previous attempt must
not affect the new one or contribute to the learner's result. Past attempts may be kept
internally for operational analytics and debugging.

### Principle 5: The backend is authoritative

The realtime AI handles the conversation. The **backend** controls:

- session identity
- stage state
- transitions
- assessment state
- grading
- persistence

The AI must not decide on its own whether a learner has passed.

### Principle 6: AI is not the source of truth for competency rules

Experts write the assessment criteria in advance. The AI helps interpret the learner's
conversation and produces **evidence**. The application then applies the actual assessment rules to that
evidence to produce the grade.
