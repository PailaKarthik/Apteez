# ApteeZ

ApteeZ is a competitive aptitude ecosystem — daily practice, live 1v1
challenges, timed contests, community events, and a contributor-reviewed
question library for placement and government-exam aspirants.

## Core product thesis

Aptitude prep is lonely and unmeasurable. ApteeZ makes it competitive and
measurable: every attempt feeds ratings, streaks, weak-area analysis, and
an AI Performance Coach, so learners always know what to practice next.

## Key features

- **Practice** — topic-organized question library, submissions with
  server-computed correctness, favorites, spaced revision signals.
- **1v1 Challenges** — Redis matchmaking + Socket.IO live rooms, server-owned
  timers/scoring (+1/−1), Elo-style challenge ratings.
- **Contests** — registration windows, frozen question sets, live standings,
  auto-submit, post-contest ratings and upsolving.
- **Events** — organizer-run quizzes/workshops/marathons with registration,
  capacity control, invites, live participation, and results.
- **Learning paths** — explore tracks, lessons, progress and resume.
- **Community** — discussions, replies, reactions, reports, moderation queue.
- **Contributions** — member-submitted questions with deterministic prechecks,
  advisory AI review, and mandatory human approval before publication.
- **Rewards** — transactional points ledger, achievements, streaks, and a
  redemption catalog with idempotent checkout.
- **AI (advisory only)** — Performance Coach, RAG Similar Problems
  (pgvector), Contribution Review. See `AI.md`. No AI Tutor (deferred).

## Tech stack

| Layer   | Technology                                                           |
| ------- | -------------------------------------------------------------------- |
| Web     | Next.js 14, React 18, TanStack Query, Tailwind, Socket.IO client     |
| API     | NestJS 10, Socket.IO, BullMQ, Zod validation                         |
| Data    | PostgreSQL 16 + pgvector (source of truth), Redis 7 (ephemeral)      |
| Storage | S3-compatible (presigned URLs) / local filesystem for dev            |
| AI      | OpenAI-compatible LLM + embedding providers behind abstractions      |
| Ops     | Docker, GitHub Actions, Sentry, `tsc`/`eslint`/`jest`/`vitest` gates |

## Local setup

Prerequisites: Node 20+, pnpm 9.15.9, a Neon project, an Upstash Redis database.
No Docker, no local PostgreSQL, no local Redis.

```powershell
# 1. Dependencies + environment
pnpm install
copy .env.example .env
# Edit .env and fill in:
#   DATABASE_URL + DIRECT_URL  (Neon `dev` branch, pooled + direct)
#   UPSTASH_REDIS_URL          (Upstash TCP endpoint, rediss://…)
#   COOKIE_SECRET              (any long random string for local dev)

# 2. Database (Neon dev branch)
pnpm db:generate
pnpm db:migrate     # migrate dev (uses DIRECT_URL)
pnpm db:seed        # dev data only — never in production

# 3. Run
pnpm dev            # web :3000 + api :3001 (via turbo)
```

Production-like full stack (builds real images, talks to Neon):

```powershell
# .env must carry Neon DATABASE_URL + DIRECT_URL and COOKIE_SECRET
docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file .env up --build
```

## Development commands

| Command                                                      | Purpose                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| `pnpm dev` / `build` / `lint` / `typecheck` / `test`         | turbo across workspaces                                              |
| `pnpm db:migrate` / `db:deploy` / `db:seed` / `db:bootstrap` | dev migrate / prod migrate / dev seed / prod bootstrap               |
| `pnpm db:seed:staging`                                       | staging demo world (guarded, synthetic; see `docs/demo-accounts.md`) |
| `pnpm --filter @apteez/api test:e2e`                         | e2e (needs local DB + Redis)                                         |
| `node scripts/load/probe.mjs`                                | read-path load probe (real numbers only)                             |
| `node scripts/smoke/smoke.mjs`                               | post-deploy smoke checks                                             |
| `node scripts/journey/journey.mjs`                           | end-to-end user journey on staging (24 checks)                       |

## Repository structure

```
apps/web/            Next.js frontend
apps/api/            NestJS API + BullMQ workers (src/main.ts, src/worker.ts)
packages/database/   Prisma schema, migrations, seed, prod bootstrap
packages/validation/ shared Zod schemas (single validation library)
packages/types/      shared API DTOs + response envelope
packages/ui/         shared React components
packages/config/     shared constants (API prefix/version)
infrastructure/docker/ dev compose + production-like compose
scripts/load|smoke/  load probe + post-deploy smoke test
scripts/journey/     scripted user journey (staging, 24 checks)
docs/                deep-dives (architecture, hardening, privacy, demo accounts, release checklist)
```

## Documentation map

- `STARTUP.md` — product concept, users, roadmap status (honest).
- `WORKING.md` — end-to-end flows per module.
- `ARCHITECTURE.md` — system design and module boundaries.
- `DEPLOYMENT.md` — AWS, Docker, CI/CD, migrations, backups, runbooks.
- `SECURITY.md` — auth, RBAC, abuse controls, AI/RAG access control.
- `AI.md` — the three approved AI capabilities and their guardrails.
