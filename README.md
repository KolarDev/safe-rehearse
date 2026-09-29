# SafeRehearse

SafeRehearse is an AI learning and practice platform, initially focused on **frontline social-care training**.
An AI Teacher teaches learners, an AI Practice Partner helps them rehearse realistic situations, and an AI
Examiner assesses them against expert-authored criteria. All three roles use live voice.

> **SafeRehearse is a learning and assessment system, not a voice-model application.
> Voice providers are replaceable infrastructure.**

## Current status: voice architecture skeleton

The end-to-end architecture is in place:

- **Backend:** StageAttempt lifecycle, assessment rules and grading, the event log, and the agent gateway (NestJS + Prisma + PostgreSQL).
- **Contracts:** a typed agent ↔ backend contract (`packages/agent-contracts`).
- **Voice agent:** a LiveKit Agents worker with Teacher, Practice Partner and Examiner roles and a replaceable provider layer (Gemini Live implemented).
- **Mock provider:** a scripted stand-in that runs full stage flows without AI.
- **Web:** a minimal dev session page (`/session`).

Course content is a single **sample** stage (not expert-reviewed). There is no authentication yet.
See [`docs/architecture.md`](docs/architecture.md) for the design, the principles, and what is still planned.

## Monorepo structure

```text
safe-rehearse/
├── apps/
│   ├── web/            # Next.js learner client (dev session page)                 → :3000
│   ├── api/            # NestJS backend: source of truth; Prisma schema, migrations, seed → :4000
│   └── voice-agent/    # LiveKit Agents worker; replaceable voice/model layer
├── packages/
│   ├── agent-contracts/  # voice-agent ↔ API contract (zod)
│   ├── types/            # web ↔ API contract (zod)
│   └── config/           # shared TypeScript + ESLint config
├── docs/architecture.md
├── docker-compose.yml  # local Postgres (pgvector), Redis, LiveKit dev server
└── .env.example
```

## Tech stack

| Area         | Technology                                                     |
| ------------ | -------------------------------------------------------------- |
| Monorepo     | pnpm workspaces, Turborepo                                     |
| Language     | TypeScript 6, zod 4                                            |
| Web          | Next.js 16, React 19, Tailwind CSS 4, LiveKit React components |
| API          | NestJS 12, Prisma 7, PostgreSQL 17 + pgvector                  |
| Voice        | LiveKit (WebRTC transport) + LiveKit Agents (Node)             |
| Models       | Gemini Live (via `@livekit/agents-plugin-google`)              |
| Jobs / cache | Redis + BullMQ (installed, not yet used)                       |
| Tests        | Vitest (domain rules), mock-provider simulation                |

## Prerequisites

- **Node.js** `^22.22.3` or `>=24.15.0` (see `.nvmrc`).
- **pnpm** 10 (`corepack enable`).
- **Docker** for local Postgres, Redis and LiveKit.
- A **Google AI Studio API key** (`GOOGLE_API_KEY`), only for real voice sessions. The mock provider needs none.

## Getting started

```bash
pnpm install
cp .env.example .env         # local defaults; add GOOGLE_API_KEY for real voice
pnpm infra:up                # Postgres :55432, Redis :16379, LiveKit :7880
pnpm db:migrate              # apply migrations
pnpm db:seed                 # sample stage (development content only)
pnpm dev                     # web, api and voice-agent
```

Then open http://localhost:3000/session, pick the sample stage, and start talking.

### Test the whole flow without AI

With the API running:

```bash
pnpm simulate                # scripted PASSED / FAILED / DROPPED + retry scenarios
pnpm test                    # unit tests for the StageAttempt rules and grading
```

## Commands

| Command                                      | Description                                         |
| -------------------------------------------- | --------------------------------------------------- |
| `pnpm dev`                                   | Run web, api and voice-agent in watch mode          |
| `pnpm build` / `lint` / `typecheck` / `test` | Across all workspaces (Turborepo)                   |
| `pnpm simulate`                              | Run mock-provider scenarios against the running API |
| `pnpm infra:up` / `infra:down`               | Start / stop local Docker infrastructure            |
| `pnpm db:migrate`                            | Create/apply migrations (dev)                       |
| `pnpm db:seed`                               | Seed the sample stage                               |
| `pnpm db:generate`                           | Generate the Prisma client                          |
| `pnpm db:studio`                             | Browse the database                                 |
| `pnpm format` / `format:check`               | Prettier                                            |

Individual apps:

```bash
pnpm --filter web dev
pnpm --filter api start:dev
pnpm --filter voice-agent dev
```

## Switching the voice provider

Set `VOICE_PROVIDER` in `.env`. Providers live in `apps/voice-agent/src/providers/`; adding one is a single
file plus a registry entry. See [docs/architecture.md §5](docs/architecture.md#5-voice-agent-internals-implemented).

## Environment

One root `.env` serves every app (see `.env.example` for all variables). Values in `.env.example` match
`docker-compose.yml`; `LIVEKIT_API_KEY=devkey` / `LIVEKIT_API_SECRET=secret` are the fixed credentials of
LiveKit's `--dev` mode. Never commit a populated `.env` with real credentials.
