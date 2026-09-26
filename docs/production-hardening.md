# Production hardening — operations guide

Supplements `architecture.md` with the cross-cutting runtime contract.

## API consistency

- Success: `{ success: true, data }`. Errors: `{ success: false, error:
{ statusCode, code, message, details? }, requestId }` via the global
  `HttpExceptionFilter`. No stacks/SQL/paths/secrets leak to clients.
- Every external input is Zod-validated (`ZodValidationPipe`); pagination
  caps at `pageSize ≤ 100` server-side; unknown routes 404 with the same
  envelope. `x-request-id` on every response.

## Auth / RBAC

- Opaque session tokens (SHA-256 hashes in Redis), HTTP-only `SameSite=Lax`
  cookies, sliding TTL, idempotent logout, per-account login budget.
- Backend authorization is authoritative (`SessionAuthGuard` → `RolesGuard`
  → `PermissionsGuard` + `requireArea` in admin handlers). Frontend roles
  are visibility only. IDOR is prevented by owner checks + explicit selects.

## Data integrity & idempotency

- All `$queryRaw` is parameterized. Capacity/ledger/redemption/review/rating
  flows run in transactions with unique constraints as the final guard.
- Retry safety is by natural keys, not client trust: submissions finalize
  once (`STARTED → SUBMITTED` conditional update), registrations return the
  existing row on unique collision, answers upsert per
  `(question, participant)`, ratings upsert per `(contest, user)`,
  redemptions dedupe on `(userId, idempotencyKey)`, BullMQ producers use
  deterministic job ids. A network retry never double-executes.

## Redis / BullMQ reliability

- Redis holds ephemeral state only (see `redis-keys.ts` for the full key
  registry with TTLs). Every feature defines fallback: cache miss →
  PostgreSQL; rate-limit down → fail-open with warning; live-state down →
  recover from PostgreSQL or fail the match safely.
- Queues: retries=3 + exponential backoff, bounded `removeOnComplete/Fail`,
  idempotent processors, enqueue failures never fail request paths.
- Operability: `GET /admin/queues` (waiting/active/delayed/failed per
  queue), `GET /admin/queues/:queue/failed` (inspectable summaries),
  `POST /admin/queues/:queue/retry` (re-drive one job).

## Cache map (all Redis caches are best-effort with PostgreSQL fallback)

| Cache                                | TTL          | Invalidation                                                                 |
| ------------------------------------ | ------------ | ---------------------------------------------------------------------------- |
| Event list/detail                    | short        | `invalidateEventCache` on create/update/transition/register/withdraw         |
| Similar problems (`ai:similar:*`)    | 1 h          | `invalidateSimilar(id)` on problem edit; full sweep on contribution approval |
| Coach summary (`ai:coach:*`)         | 10 min       | TTL only (recomputed from fresh tool data)                                   |
| Reward catalog (in-memory)           | 60 s         | cleared on create/update/redeem/restock                                      |
| Reward rules (in-memory)             | 60 s         | TTL only (admin edits propagate within a minute)                             |
| Search suggest/trending/filters      | 60/300/600 s | TTL only (derived aggregates)                                                |
| Recommendations (`recs:*`, per user) | 5 min        | TTL only (per-user key, no cross-user leak)                                  |
| Admin overview                       | 60 s         | TTL only (counts, short window)                                              |
| Leaderboard/ratings                  | none         | always computed from authoritative tables                                    |

No authorization-sensitive or private data persists beyond its TTL, and no
cache write can corrupt PostgreSQL (caches are never read as truth).

## Real-time

- Identity comes from the authenticated handshake (cookie/Bearer → session),
  never client-supplied ids. Subscribe/answer payloads are Zod-validated,
  flood-guarded per user, and only `AppError` codes reach clients. The
  server owns correctness, scores, timers, results, and ratings.

## Uploads & content

- Avatars: 5 MB cap, MIME allowlist (jpeg/png/webp) **plus magic-byte
  signature check**, generated keys (`avatars/<user>/<uuid>.<ext>`), no
  original filenames. User text is stored as text and rendered as text
  (React escaping); `sanitizePlainText` strips angle brackets/active
  vectors before storage.

## Observability & health

- Structured JSONL logs with `requestId/userId/route/method/status/duration`;
  Sentry DSN-gated on API + web with PII scrubbing.
- Health: `GET /health` (full dependency check, 503 when degraded),
  `GET /health/live` (process liveness, no deps), `GET /health/ready`
  (readiness = same as `/health`). Queue depths ride along in `checks`.
- Graceful shutdown: `enableShutdownHooks` + `onModuleDestroy` for
  Redis (`quit` with timeout), Prisma (`$disconnect`), Socket.IO gateway
  (warn + disconnect + close). In-flight HTTP drains; critical jobs are
  idempotent so a restart re-drives them.

## AI / RAG

- All model access flows through `AiModule` (`LLMProvider` /
  `EmbeddingProvider` abstractions, server-side keys only). Structured
  outputs are Zod-validated with one repair retry, then deterministic
  fallback. Per-user daily budgets (`AI_DAILY_LIMIT`, Redis counter,
  fail-open) + append-only `AiUsageLog`.
- Performance Coach: LangGraph `gather → reason ⇄ tools → finalize →
ground` with 8 user-scoped LangChain tools, ≤2 tool rounds, 10 s per
  call, 75 s graph timeout, explicit Zod re-validation, and ID grounding;
  deterministic summary cached 10 min (Redis, best-effort).
- Similar Problems: normalized text → query embedding → pgvector neighbors
  (exact model/dimensions/version triple) → metadata filter + app-layer
  re-filter → transparent rerank → top PUBLISHED canonical problems;
  lexical topic/rating fallback when vectors are unavailable; results
  cached 1h. Never returns generated questions.
- Embeddings: versioned representation, async BullMQ pipeline, stale
  marking on content edits, paged idempotent backfill chain
  (`POST /admin/ai/embeddings/backfill`); duplicate detection unions
  trigram + vector candidates for admins.
- Contribution Review stays human-in-the-loop: AI output is advisory
  (`ContributionAiReview`); only admin approval publishes.
- Evaluation: `AiEvaluationService.runAll()` on versioned fixtures (no LLM,
  no prod data), admin-visible at `GET /admin/ai/evaluations`.

## Testing / load

- Unit (`*.spec.ts`), integration (API + DB via e2e specs), AI schema/tool
  tests, and lightweight load probes (`scripts/load/probe.mjs`, p50/p95/max,
  real numbers only). E2E refuses non-test databases (`test/setup-e2e.ts`
  guard — point `DATABASE_URL` at `*_test` on localhost).
