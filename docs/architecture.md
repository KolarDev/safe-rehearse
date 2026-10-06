# SafeRehearse Architecture

> **SafeRehearse is a learning and assessment system, not a voice-model application.
> Voice providers are replaceable infrastructure. We switch the adapter, not the product.**

This document separates what is **implemented** from what is **planned**. Each section says which.

## 1. Product overview

SafeRehearse is an AI learning and practice platform, initially for frontline social-care training.

- **Phase 1: Interactive learning.** An AI Teacher teaches training material through live voice.
- **Phase 2: Scenario practice & assessment.** Scenarios are divided into **stages**. Every stage runs
  through three voice-based modes:

  | Mode                 | Intent                                     |
  | -------------------- | ------------------------------------------ |
  | **Teacher**          | "Let me teach you this."                   |
  | **Practice Partner** | "Let's practise this situation."           |
  | **Examiner**         | "I'm going to assess how you handle this." |

  The Examiner mode produces a structured grade against predefined assessment criteria.

## 2. System overview (implemented)

```text
                    ┌───────────────────────┐
                    │  apps/web  (Next.js)  │  mic / speaker, transcript, attempt state
                    └──────┬─────────┬──────┘
                    WebRTC │         │ HTTP (start attempt, voice session, poll state)
                    ┌──────▼──────┐  │
                    │   LiveKit   │  │  realtime transport: audio, turn-taking, rooms
                    └──────┬──────┘  │
                    ┌──────▼──────────────────┐
                    │ apps/voice-agent        │
                    │  livekit/  (transport)  │
                    │  agents/   (Teacher,    │
                    │   Practice, Examiner)   │
                    │  core/     (controller, │
                    │   tools, backend client)│
                    │  providers/ ────────────┼──► Gemini Live   (implemented)
                    │                         │    OpenAI Realtime, STT→LLM→TTS, local (planned)
                    └──────┬──────────────────┘
                           │  @safe-rehearse/agent-contracts  (HTTP + shared secret)
                    ┌──────▼──────────────────┐
                    │ apps/api  (NestJS)      │  SOURCE OF TRUTH
                    │  stage attempts, rules, │
                    │  evidence, grading,     │
                    │  course knowledge       │
                    └──────┬──────────────────┘
                    ┌──────▼──────┐   ┌──────────────┐
                    │ PostgreSQL  │   │ Redis/BullMQ │  (planned)
                    │ + pgvector  │   └──────────────┘
                    └─────────────┘
```

### Components

| Component                  | Responsibility                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                 | Starts attempts, joins the LiveKit room, plays audio, shows transcript and backend-reported state. Minimal dev page at `/session`.                                         |
| `apps/api`                 | Owns all state: stages, criteria, knowledge, StageAttempts, events, evidence, results. Issues LiveKit tokens and dispatches the agent. Decides every transition and grade. |
| `apps/voice-agent`         | Replaceable realtime layer. Runs the conversation, plays the three roles, calls tools, reports events. Decides nothing.                                                    |
| `packages/agent-contracts` | The language between voice-agent and API: events, decisions, session context. zod schemas validated on both sides.                                                         |
| `packages/types`           | Web ↔ API request/response schemas.                                                                                                                                        |
| LiveKit                    | WebRTC transport, audio, turn detection, interruptions, agent job dispatch.                                                                                                |

## 3. The key boundary: agent ↔ backend

The agent may **report** and **request**. Only the backend **decides**.

We separate four things:

| Concern               | Owner            | Example                                                                           |
| --------------------- | ---------------- | --------------------------------------------------------------------------------- |
| **A. Conversation**   | voice-agent      | What the AI says and hears                                                        |
| **B. Evidence**       | agent → backend  | `{ type: "evidence", criterionId, evidence, confidence }`                         |
| **C. Control events** | agent → backend  | `{ type: "stage_transition_requested", from: "TEACHER", to: "PRACTICE_PARTNER" }` |
| **D. Business state** | **backend only** | `StageAttempt.status`, `mode`, criterion results                                  |

### Contract (`packages/agent-contracts`)

Agent → backend, `POST /agent/attempts/:id/events`, wrapped in an envelope with a UUID `eventId`:

| Event                         | Meaning                                                       |
| ----------------------------- | ------------------------------------------------------------- |
| `transcript`                  | A line of conversation (learner or agent)                     |
| `evidence`                    | Something bearing on a criterion, with the model's confidence |
| `stage_transition_requested`  | "This mode is finished; may we move on?"                      |
| `feedback`                    | Formative feedback given in practice (recorded, never graded) |
| `session` (`started`/`ended`) | Session lifecycle, with an end reason                         |

Every event gets a decision: `{ accepted: true, attempt }` or
`{ accepted: false, reason, message, attempt }`. A rejection is a normal answer (HTTP 200), and its
`message` goes back to the model so it can carry on correctly. Every event is logged, accepted or not.
Delivery is idempotent on `eventId`.

Backend → agent, `GET /agent/attempts/:id/context`: the attempt snapshot, the stage, the course knowledge
selected by the backend, author instructions per mode, and the criteria the Examiner gathers evidence against.

Both routes require `Authorization: Bearer $AGENT_API_SECRET`.

## 4. StageAttempt lifecycle (implemented)

```text
                 start / retry (always a NEW attempt)
                              │
                              ▼
   ┌──────────── IN_PROGRESS ─────────────────────────────────┐
   │   mode: TEACHER ──► PRACTICE_PARTNER ──► EXAMINER ──► assessment
   │         (each step only on an accepted transition request)    │
   └───────┬───────────────────────────────────────────────┬──┘
           │ session ends / learner leaves / error          │ backend applies rules
           ▼                                                ▼
        DROPPED  (never graded)                    PASSED  |  FAILED
```

Rules (pure functions in `apps/api/src/stage-attempts/domain/`, unit-tested):

- Modes advance one step at a time, only from the attempt's current mode.
- Evidence counts only when recorded **in the Examiner mode**, against a criterion of that stage.
- Grading: a criterion is met when the attempt has Examiner-mode evidence for it with
  confidence ≥ the criterion's expert-set `minConfidence`. The attempt passes when every **required**
  criterion is met. The AI never grades.
- Any session end while `IN_PROGRESS` → `DROPPED`, whatever the reason.
- Starting the same stage again drops any in-progress attempt (`endReason: superseded`) and creates a
  fresh one. Nothing carries over; old attempts stay in the database for analytics.
- One voice session per attempt. A lost session is never resumed: the learner retries.
- Terminal attempts (`DROPPED`, `PASSED`, `FAILED`) never change again.
- Events for one attempt are serialised with a row lock (`SELECT … FOR UPDATE`).

## 5. Voice agent internals (implemented)

```text
apps/voice-agent/src/
├── main.ts                 LiveKit worker entry: one job = one attempt's session
├── config.ts
├── core/                   provider- and transport-independent
│   ├── backend-client.ts   the only channel to the API (contracts, retries, timeouts)
│   ├── session-controller.ts  tracks backend-reported mode; turns actions into events
│   └── tools.ts            neutral tool definitions per mode
├── agents/instructions.ts  Teacher / Practice Partner / Examiner prompts, built from backend context
├── livekit/stage-agent.ts  adapts one mode to a LiveKit Agent; handoff on accepted transitions
├── providers/              ◄── the replaceable part
│   ├── types.ts            VoiceModelProvider: realtime model OR STT→LLM→TTS pipeline
│   ├── gemini-live.ts
│   └── index.ts            registry, selected by VOICE_PROVIDER
└── mock/                   scripted "model" for testing without AI (see §7)
```

Tools per mode (the model sees only these):

| Mode             | Tools                                         |
| ---------------- | --------------------------------------------- |
| Teacher          | `show_text`, `show_scenario`, `complete_mode` |
| Practice Partner | `record_feedback`, `complete_mode`            |
| Examiner         | `complete_mode`                               |

When the backend accepts `complete_mode`, the LiveKit adapter hands off to the next mode's agent.

**Evidence is extracted after the exam, not recorded during it.** Gemini Live reliably closes the
connection (1011 "Internal error") when it calls a tool while playing a character, so the Examiner
has no evidence tool. When it calls `complete_mode`, the `SessionController` sends the Examiner-mode
transcript (kept locally, so it never depends on transcript delivery) to an `EvidenceExtractor`
(`src/core/evidence-extractor.ts`; today a Gemini text model, `src/providers/gemini-evidence.ts`). It
submits each finding as a normal `evidence` event, then requests `ASSESSMENT`. The backend validates and
grades exactly as before. `complete_mode` is refused until the learner has said something in the exam.
If extraction fails twice, the attempt is ended as `agent_error` and dropped, never graded on nothing.

### Adding a provider

1. Implement `VoiceModelProvider` in `src/providers/<name>.ts`. Return a realtime model, or an STT/LLM/TTS
   pipeline built from LiveKit plugins (so pipelines can mix vendors, e.g. Deepgram + Claude + Cartesia).
2. Register it in `src/providers/index.ts`.
3. Set `VOICE_PROVIDER=<name>`.

Nothing in `core/`, `agents/`, the API, or the web client changes.

## 6. Course knowledge (implemented seam, retrieval planned)

The agent never embeds course content of its own. The API's `KnowledgeService` selects the knowledge for
a stage and serves it in the session context. Today it returns the stage's `KnowledgeChunk`s in order.
Later it will use **pgvector** retrieval in the same PostgreSQL database (the extension is already enabled;
no vector columns yet, because their dimension depends on the embedding model). No separate vector database.

## 7. Testing without AI (implemented)

`apps/voice-agent/src/mock/` contains a scripted stand-in for the model. It calls the same tools through
the same `SessionController`, against the real API and database, with no LiveKit and no model:

```bash
pnpm --filter voice-agent simulate          # pass, fail, drop
```

The scenarios check full-stage PASSED and FAILED flows, rejected evidence outside the Examiner mode, a mid-session disconnect ending
DROPPED, and a retry starting a fresh attempt. Domain rules also have unit tests (`pnpm --filter api test`).

## 8. Data model (implemented)

`Scenario` → `Stage` (instructions per mode, learning objectives) → `AssessmentCriterion` (key, required,
`minConfidence`) and `KnowledgeChunk`.
`StageAttempt` (status, mode, timestamps, `endReason`, `learnerRef`) → `AgentEvent` (append-only log),
`Evidence`, `CriterionResult`.

`learnerRef` is a plain string until authentication exists.

## 9. Planned, not implemented

- Further providers: OpenAI Realtime, STT→LLM→TTS pipelines, local models (Qwen/Ollama, Whisper, Piper).
- Authentication and authorisation (a real `Learner` replacing `learnerRef`; learner-scoped attempt access).
- A stale-attempt sweeper: a BullMQ job that drops `IN_PROGRESS` attempts whose agent never started or went silent.
- Feedback engine: post-session feedback generated from the transcript and evidence.
- Learner progress / competency tracking across stages and scenarios.
- pgvector retrieval in `KnowledgeService`.
- Authoring tools for expert-written scenarios, stages and criteria.
- Production deployment of LiveKit (Cloud or self-hosted) and the agent worker (`lk agent` tooling).

## 10. Architectural principles

### Principle 1: Stage is the atomic learning unit

`Teacher → Practice Partner → Examiner → Result`, all in one voice session. Stages can be completed
independently; a learner continues a scenario at later stages.

### Principle 2: StageAttempt is the execution of a stage

A learner may make many attempts: `Attempt 1 → DROPPED`, `Attempt 2 → FAILED`, `Attempt 3 → PASSED`.

### Principle 3: Dropped attempts are not graded

If a session is interrupted (error, network failure, browser close, the learner leaving, or any other
failure), the attempt becomes `DROPPED` and does not count toward learner performance.

### Principle 4: Retry creates a fresh attempt

Retry starts a new StageAttempt. The previous attempt must not affect the new one. Past attempts
are kept for operational analytics and debugging.

### Principle 5: The backend is authoritative

The realtime AI handles conversation. The backend controls session identity, stage state, transitions,
assessment state, grading and persistence. The AI never decides whether a learner has passed.

### Principle 6: AI is not the source of truth for competency rules

Criteria are predefined and expert-authored. The AI interprets the conversation and produces evidence;
the application applies the rules.

### Principle 7: Voice providers are replaceable infrastructure

The product never depends on a specific model. Providers sit behind `VoiceModelProvider`; the agent talks
to the product only through `agent-contracts`; course knowledge comes from the backend.
