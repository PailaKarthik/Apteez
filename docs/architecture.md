# ApteeZ architecture (foundation)

This note captures the structural decisions of Prompts 01–03 so later
prompts extend the system without rewrites.

## Data ownership

- **PostgreSQL is the system of record.** Users, roles, permissions and (soon)
  questions, submissions, contests and reviews live here via Prisma.
- **Redis is ephemeral.** Queues, live challenge/contest state, locks, rate
  limits and caches only. Nothing in Redis must be unrecoverable.
- **Object storage is abstracted** behind `StorageService`. Local filesystem
  for development, any S3-compatible store in AWS-compatible environments.
  The frontend never constructs storage URLs — it only uses URLs minted by
  the API.

## Authority

The NestJS backend is authoritative for scores, timers, challenge results,
contest state, ratings, rewards and permissions. Guards (`RolesGuard`,
`PermissionsGuard`) re-check every request server-side.

## Contracts

- Every API response uses the envelope in `@apteez/types`: success responses
  are `{ success: true, data }`, errors are `{ success: false, error: {
statusCode, code, message, details? }, requestId }`.
- Zod is the single validation library. Shared schemas live in
  `@apteez/validation`; the API validates requests with `ZodValidationPipe`.
- API versioning is URI-based (`/api/v1/...`).

## Module boundaries

Sixteen NestJS product modules are registered in `AppModule` as empty
boundaries. Later prompts implement them independently. The rating engine
stays inside `LeaderboardModule`; the contribution lifecycle
(`PENDING → UNDER_REVIEW → APPROVED | REJECTED`) stays inside
`ContributionModule` with review tooling in `AdminModule`.

## Authentication & authorization (Prompt 03)

- **Sessions**: opaque random tokens; only their SHA-256 hashes live in
  Redis (`sess:<hash>` → `{ userId, via, ip, userAgent }`), so a Redis dump
  cannot impersonate anyone. The client holds an HTTP-only `SameSite=Lax`
  cookie (web) or uses `Authorization: Bearer` (future mobile). Sliding TTL
  refresh; `revoke`/`revokeAllForUser` take effect immediately; logout is
  idempotent.
- **Identity**: `User` is the account; `AuthIdentity`
  (`provider` + `providerUserId`, unique together) is the OAuth link — never
  email alone. Google sign-in links by identity first, then verified email,
  else provisions a new user. CITEXT columns make email/username
  uniqueness case-insensitive in the database.
- **RBAC**: database-backed. `SessionAuthGuard` (global) resolves the
  session and loads roles + `action:resource` permissions; `RolesGuard` and
  `PermissionsGuard` enforce `@Roles(...)` / `@Permissions(...)`.
  Registration always assigns only the `user` role — role changes are
  administrative operations. Frontend role data is visibility only.
- **Abuse protection**: Redis-backed `@nestjs/throttler` storage (two
  named limiters: default + stricter `auth`), a per-account failed-login
  budget (429 on exhaustion), and an Origin/Referer allowlist check
  (`OriginCheckMiddleware`) as CSRF defense for cookie-authenticated
  mutations. Enumeration-safe errors: unknown account and wrong password
  are indistinguishable (`INVALID_CREDENTIALS`); `ACCOUNT_EXISTS` never says
  which field collided.
- **Audit**: `auth.register`, `auth.login` (success/failure),
  `auth.login disabled`, `auth.logout`, `auth.oauth.*` events are logged
  via AppLogger with userId/email/ip — passwords, tokens and client secrets
  are never logged. A dedicated audit table can subscribe to the same
  events later.

## Production hardening (Prompt 19)

- **Error contract**: the global `HttpExceptionFilter` maps every failure to
  `{ success: false, error: { statusCode, code, message, details? },
requestId }`. Status-to-code mapping covers 400/401/403/404/409/413/415/
  422/429/501/503; stacks, SQL, paths and secrets stay server-side. Every
  input is Zod-validated (`eventInviteRespondSchema` closed the last bare
  `@Body()`); storage traversal attempts 404 instead of 500.
- **Environment**: `validateEnv` fails fast; production requires a real
  `COOKIE_SECRET`, and `STORAGE_PROVIDER=s3` requires endpoint + bucket +
  credentials. Safe placeholders live in `.env.example` — never real keys.
- **Database**: all `$queryRaw` is parameterized tagged-template SQL (no
  `Unsafe` variants). Rank assignment is set-based (`ROW_NUMBER` window
  updates, mirroring the JS comparators exactly). Registration capacity is
  enforced atomically (`SELECT … FOR UPDATE` inside the insert transaction).
  Challenge question sampling and admin solved-counts are SQL-aggregated,
  never full-table loads. Hot-path indexes ship in
  `20260918000000_prompt19_hardening` (submissions correctness rollups,
  ledger type/source lookups, participant expiry sweeps, search analytics).
- **Queues**: BullMQ defaults are retries=3 with exponential backoff; the
  challenge processor rethrows so failures retry instead of marking
  complete; notification fanout is paginated (no 5000-row truncation);
  scheduler jobs keep failure evidence. Enqueue failures never fail request
  paths. Queue depths are visible in `/health` (`checks.queues`).
- **Real-time**: the challenge gateway validates subscribe payloads with
  Zod, rethrows auth failures as disconnects, rate-limits matchmaking/answer
  events per user (Redis counter, fail-open like HTTP throttling), and only
  forwards `AppError` codes to clients — arbitrary error internals never
  leak.
- **HTTP**: explicit Helmet posture (`CORP: cross-origin` so `<img>` assets
  from the API origin render; CSP intentionally off — the API serves JSON +
  bytes only). Local storage responses add `nosniff`.
- **Observability**: request IDs on every response (`x-request-id`),
  structured AppLogger JSONL, optional Sentry (API + web, DSN-gated, cookies/
  headers/bodies scrubbed, no PII beyond user id).

## AI application layer + RAG (Prompt 19)

- **Providers are abstracted** (`LLMProvider`/`EmbeddingProvider` over
  OpenAI-compatible HTTPS, no vendor SDKs). Keys are server-side only;
  unconfigured features degrade deterministically — never block the core
  platform.
- **All model access flows through `AiModule`**: `AiToolRegistry` exposes
  exactly eight Zod-validated tools over `CoachToolsService` (application
  services, never SQL); `StructuredOutputService` parses + validates every
  response with one repair retry, then fails safe; `AiUsageTrackerService`
  enforces per-user daily budgets and writes append-only `AiUsageLog` rows.
- **Performance Coach** is a real LangGraph.js `StateGraph`
  (`coach-graph.ts`): gather → reason (LangChain `ChatOpenAI` + the eight
  registry tools bound, ≤2 tool rounds) ⇄ tools → finalize
  (`withStructuredOutput` + explicit Zod re-validation, one repair retry,
  provider-agnostic text fallback) → ground (suggested IDs ∩ tool output),
  with a deterministic-summary fallback at every failure point. Guardrails:
  10 s per tool call, 75 s graph timeout, recursionLimit 20, temperature 0.
- **RAG** uses Neon PostgreSQL + pgvector (extension enabled idempotently by
  the RAG migration; local dev previously used the `pgvector/pgvector:pg16`
  image, now removed in favor of Neon):
  `problem_embeddings` holds one row per problem (vector opaque to Prisma,
  written only by the embedding pipeline), exact cosine scan (no ANN index:
  HNSW is rejected by Neon's storage layer and IVFFLAT caps at 2000 dims
  vs 3072 — see migrations 20260926000001/2; revisit on slow-query evidence),
  model/dimensions/version metadata so embeddings never silently mix.
  `SimilarProblemService` runs query-embedding → pgvector neighbors →
  metadata filtering → transparent rerank (`rerankScore`: cosine 0.6, topic
  0.2, subtopic 0.1, difficulty/rating compatibility) → top canonical
  PUBLISHED problems, falling back to the lexical topic/rating band.
  Embeddings are generated asynchronously via BullMQ (`AiProcessor`),
  enqueued on contribution approval and problem updates; failures mark rows
  `FAILED` and retry later.
- **Contribution Review stays human-in-the-loop**: analysis is advisory
  metadata (`ContributionAiReview`); only admin approval mints library
  content.
- **Evaluation**: `AiEvaluationService` runs versioned fixture suites
  (coach grounding, rerank ordering, review-schema validity) with no LLM
  calls and no production data; results are admin-visible at
  `GET /admin/ai/evaluations`.

## Operations addendum (hardening completion)

- **Health**: `/health/live` (liveness, no deps) vs `/health` + `/health/ready`
  (readiness with DB/Redis/queue checks).
- **Queues**: `GET /admin/queues`, `GET /admin/queues/:queue/failed`,
  `POST /admin/queues/:queue/retry` (admin-only observability).
- **Shutdown**: gateway `onModuleDestroy` (warn + disconnect + close) joins
  the existing Redis/Prisma hooks under `enableShutdownHooks`.
- **Uploads**: avatar magic-byte signature check in addition to MIME/size.
- **AI cost**: deterministic coach summaries cached 10 min, similar-problem
  responses cached 1h (Redis, best-effort, fail-open).
- **Safety**: E2E guard (`test/setup-e2e.ts`) refuses non-test databases.
- See `docs/production-hardening.md` (runtime contract) and
  `docs/privacy-retention.md` (retention schedule).
