# ApteeZ — Architecture

```
Next.js (web)
   ↓ HTTPS (TanStack Query, Socket.IO client)
NestJS API (authoritative)
   ├─ Auth / RBAC            sessions (Redis) · roles+permissions (Postgres)
   ├─ Problems / Submissions server-graded attempts, favorites
   ├─ Challenge              matchmaking (Redis) · live rooms (Socket.IO) · rating
   ├─ Contest                registration → frozen sets → results → rating
   ├─ Events / Organizations state machines, invites, fanout
   ├─ Learning / Explore     taxonomy, lessons, progress
   ├─ Leaderboard / Rating   Elo-style engines + append-only history
   ├─ Discussions            threads, replies, reactions, reports
   ├─ Contributions          submit → AI precheck → human approval → publish
   ├─ Profile / Analytics    rollups, streaks, achievements, heatmaps
   ├─ Rewards / Points       transactional ledger + redemption catalog
   ├─ Notifications          BullMQ fanout → inbox rows
   ├─ Search / Recommend     lexical + cached + RAG similar problems
   ├─ Admin                  area-gated ops + immutable audit log
   └─ AI Application Layer   providers · tools · structured outputs · usage
          ↓ embeddings / retrieval
PostgreSQL 16 + pgvector (source of truth)
Redis 7 + BullMQ (ephemeral: queues, locks, rate limits, live state)
Object storage (S3-compatible presigned URLs; local FS for dev)
```

Deep-dives: `docs/architecture.md` (foundations), `docs/production-hardening.md`
(runtime contract), `docs/privacy-retention.md` (retention), `AI.md`, `SECURITY.md`.

## Responsibility boundaries (non-negotiable)

- Frontend owns **nothing authoritative**: no scores, ratings, points,
  timers, correctness, or permissions. It renders server state.
- AI owns **no data access**: tools call application services; no SQL, no
  secrets, no direct repository access from model paths.
- Redis owns **nothing permanent**: sessions, queues, locks, counters, live
  state, caches — all with TTLs and PostgreSQL fallbacks.
- Workers own **no validation shortcuts**: same services, same Zod inputs,
  same transactions as HTTP handlers.

## Monorepo

`apps/web`, `apps/api` (HTTP `src/main.ts` + queue-only `src/worker.ts`
sharing one `AppModule`); `packages/database` (Prisma),
`packages/validation` (single Zod source), `packages/types` (DTOs +
`{ success, data }` / `{ success:false, error, requestId }` envelope),
`packages/ui`, `packages/config`. No circular dependencies: feature modules
never import admin; admin imports leaf modules only.

## Database (PostgreSQL + pgvector)

UUID keys, timestamptz, explicit join models, soft-delete only for
moderation, enums for lifecycles. Hot-path indexes ship in migrations
(submissions rollups, ledger lookups, participant sweeps). `problem_embeddings`
(one row/problem, opaque `vector(3072)` for Google gemini-embedding-001 + model/dimensions/version/status)
and `ai_usage_logs` back the RAG and cost-control planes. Migrations are
forward-only and applied with `prisma migrate deploy` — never `db push` in
deployed environments.

## Redis + BullMQ

Key registry in `redis-keys.ts` (`apteez:` namespace). Queues:
`challenge-jobs`, `event-jobs`, `ai-jobs` — retries=3, exponential backoff,
deterministic job ids (idempotent producers), bounded retention, failed jobs
inspectable at `GET /admin/queues`. API and worker processes share handlers;
BullMQ distributes, idempotency absorbs overlap.

## Real-time

Socket.IO `/challenge` namespace; identity from session handshake (never
client ids); Zod payloads; per-user flood guards; only `AppError` codes reach
clients. `ChallengeRealtime` + `ChallengeEvents` are process-local by design
(multi-instance fan-out via Redis adapter is a documented future step, not a
silent behavior change).

## Auth / RBAC

Opaque session tokens (SHA-256 hashes in Redis), HTTP-only `SameSite=Lax`
cookies (+ Bearer for future mobile), sliding TTL, idempotent logout,
per-account login budgets, enumeration-safe errors. DB-backed
`action:resource` permissions enforced by global guards + `requireArea`
server-side; OAuth links by provider identity, never email alone.

## Search / analytics

Trigram-assisted lexical search with Redis-cached suggestions/trending;
`UserActivityDaily` precomputed rollups; append-only `SearchEvent` signals.
RAG retrieval is isolated behind `SimilarProblemService` (pgvector →
metadata filter → transparent rerank).
