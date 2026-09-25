# SafeRehearse

SafeRehearse is an AI learning and practice platform, initially focused on **frontline social-care training**.
An AI Teacher teaches learners, an AI Practice Partner helps them rehearse realistic situations, and an AI
Examiner assesses them against expert-authored criteria. All three roles use live voice.

## Current status: Phase 0 (project foundation)

This repository currently contains **only the project foundation**: the monorepo, tooling, and framework bootstraps.
There are no product features, database models, API endpoints, auth, AI, or voice functionality yet.

See [`docs/architecture.md`](docs/architecture.md) for the **planned** architecture and guiding principles.

## Monorepo structure

```text
safe-rehearse/
├── apps/
│   ├── web/                 # Next.js + React + Tailwind CSS (web client)      → port 3000
│   └── api/                 # NestJS (backend, authoritative for all state)    → port 4000
├── packages/
│   ├── config/              # Shared TypeScript base configs + ESLint config
│   └── types/               # Shared types (placeholder, no domain types yet)
├── prisma/
│   └── schema.prisma        # Generator + datasource only (no models yet)
├── docs/
│   └── architecture.md      # Planned architecture & principles
├── prisma.config.ts         # Prisma CLI config (reads DATABASE_URL from .env)
├── .env.example             # Environment variable placeholders
├── package.json             # Root scripts (delegate to Turborepo)
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.json            # Root TS config (root tooling files only)
```

## Tech stack

| Area         | Technology                                                   |
| ------------ | ------------------------------------------------------------ |
| Monorepo     | pnpm workspaces, Turborepo                                   |
| Language     | TypeScript 6                                                 |
| Web          | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4 |
| API          | NestJS 12 (Express), `@nestjs/config`                        |
| Database     | PostgreSQL + Prisma 7 (pgvector planned)                     |
| Jobs / cache | Redis + BullMQ (dependencies installed, not yet wired)       |
| Code quality | ESLint (flat config), Prettier, EditorConfig                 |

## Prerequisites

- **Node.js** ≥ 22.12. Node 22.22+ or 24 LTS is recommended, because `@nestjs/schematics` declares `^22.22.3 || ^24.15.0`.
- **pnpm** 10. Run `corepack enable` to use the version pinned in `package.json`.
- PostgreSQL and Redis are **not required yet**. Nothing connects to them in Phase 0.

## Getting started

```bash
pnpm install
cp .env.example .env     # optional for now; defaults are used when unset
pnpm dev                 # web → http://localhost:3000, api → http://localhost:4000
```

The API has one infrastructure endpoint, `GET /health`, which returns `{ "status": "ok" }`.

## Commands

Run from the repository root:

| Command             | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `pnpm dev`          | Run all apps in watch mode (via Turborepo)                  |
| `pnpm build`        | Build all packages and apps                                 |
| `pnpm lint`         | Lint all workspaces                                         |
| `pnpm typecheck`    | Type-check all workspaces                                   |
| `pnpm format`       | Format the repo with Prettier                               |
| `pnpm format:check` | Check formatting                                            |
| `pnpm db:validate`  | Validate the Prisma schema                                  |
| `pnpm db:format`    | Format the Prisma schema                                    |
| `pnpm db:generate`  | Generate the Prisma client into `apps/api/generated/prisma` |

Run a single app:

```bash
pnpm --filter web dev          # Next.js only
pnpm --filter api start:dev    # NestJS only (or: pnpm --filter api dev)
pnpm --filter api build
```

## Environment

All variables live in one root `.env`, copied from `.env.example`. The API loads `apps/api/.env` first, then the
root `.env`. The web app loads the root `.env` through `next.config.ts`, and any app-local `apps/web/.env*` files take precedence.
Never commit a populated `.env`.
