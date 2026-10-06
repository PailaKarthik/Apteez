# ApteeZ — Deployment (free-tier: EC2 + Neon + Upstash + S3)

## 1. Architecture (small-production, honest scale)

Target architecture — not yet provisioned and not in this repo (no
Terraform/CloudFormation here by choice; provision it once, review it like
code). Single-region, no Kubernetes/Kafka/Elasticsearch/ECS/RDS/ElastiCache
— the workload does not need them. One small EC2 instance, managed data
stores, zero databases on the instance itself.

```
Route 53 (apteez.example.com, api.apteez.example.com)
   ↓
CloudFront (web CDN + HTTPS)          ACM certificates
   ↓
Next.js → EC2 (`next start`) or Amplify/S3+CF equivalent

ALB or direct HTTPS (security group: 443 only; /api/v1/health/ready target check)
   ↓ (sticky not required: sockets are single-instance; see §10)
EC2 t3.micro/small:
   ├─ NestJS API (`node dist/main`, PM2/systemd, 1 process)
   └─ Worker (`node dist/worker`, 1 process — BullMQ distributes)

Neon PostgreSQL + pgvector (ONLY permanent DB; branches per env)
Upstash Redis (TLS + AUTH; ephemeral only)   S3 private bucket (assets)
CloudWatch + Sentry                          Secrets Manager (all secrets)
```

Why EC2 over Fargate/Lambda: a single free-tier-compatible instance runs the
API + one worker for the price of nothing; long-lived Socket.IO connections
and BullMQ workers fit a persistent process, Lambda would break both. Scale
later: bigger instance first, then split API/worker — the code is already
process-separated (`main.ts` vs `worker.ts`).

## 2. Environments

`development` (Neon dev branch + local Redis + `pnpm dev`), `test`
(isolated `*_test` database — a Neon branch or local throwaway; the e2e
guard refuses anything else), `staging` (isolated Neon branch, disposable
data, pre-prod verification), `production` (Neon production database,
backups on). `NODE_ENV` selects behavior; `validateEnv` fails fast on
missing/invalid config at boot.

### Neon branches (one per environment)

```powershell
# Neon dashboard → Branches → Create branch from production (or from dev):
#   apteez-dev      ← local development (DATABASE_URL/DIRECT_URL point here)
#   apteez-staging  ← staging seed + journey runs
#   apteez-test     ← e2e (or keep a local throwaway; see below)
# Branches are NOT backups — production keeps automated backups + PITR on.
```

### Staging data (Neon staging branch)

```powershell
# Point at the staging branch, then migrate → bootstrap → demo world
$env:DATABASE_URL='<Neon staging pooled connection>'
$env:DIRECT_URL='<Neon staging direct connection>'
pnpm --filter @apteez/database db:deploy   # uses DIRECT_URL automatically
pnpm db:seed:staging   # refuses production + non-demo databases (verified)
```

Demo accounts and scenarios: `docs/demo-accounts.md` (staging-only
credentials, never production). The full user journey runs against staging:
`node scripts/journey/journey.mjs` (24 checks, JOURNEY OK, re-verified
2026-09-18 against a fresh staging database with the current build).

## 3. Environment variables

| Variable                                                                            | Required    | Notes                                                                 |
| ----------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| `NODE_ENV`                                                                          | —           | development/test/production (default development)                     |
| `PORT`                                                                              | —           | API listen port (default 3001)                                        |
| `DATABASE_URL`                                                                      | prod: yes   | Neon **pooled** URL (`-pooler` host, `?pgbouncer=true`); runtime only |
| `DIRECT_URL`                                                                        | prod: yes   | Neon **direct** URL (no pooler); migrations/introspection only        |
| `REDIS_URL`                                                                         | prod: yes   | Upstash `rediss://default:<token>@<host>:6379` (TLS)                  |
| `COOKIE_SECRET`                                                                     | prod: yes   | random 32+ bytes, Secrets Manager                                     |
| `CORS_ORIGINS`                                                                      | prod: yes   | `https://apteez.example.com` (no localhost)                           |
| `TRUST_PROXY`                                                                       | —           | `1` behind ALB                                                        |
| `APP_URL` / `API_URL`                                                               | prod: yes   | public web/API origins (OAuth callbacks derive from these)            |
| `GOOGLE_CLIENT_ID/SECRET/CALLBACK_URL`                                              | OAuth only  | unset → Google buttons return to login with an inline message         |
| `STORAGE_PROVIDER=s3` + `S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY` | prod: yes   | IAM role preferred over keys on EC2                                   |
| `SENTRY_DSN` (+ `NEXT_PUBLIC_SENTRY_DSN`)                                           | recommended | unset → Sentry off, app unaffected                                    |
| `LLM_*` / `EMBEDDING_*`                                                             | AI only     | unset → deterministic fallbacks; never in git                         |
| `AI_DAILY_LIMIT`                                                                    | —           | per-user/day/feature budget (`0` disables AI)                         |
| `NEXT_PUBLIC_API_URL`                                                               | web build   | inlined at build time; backend secrets never `NEXT_PUBLIC_`           |

Full placeholder reference: `.env.example` (+ `apps/web/.env.example`).

## 4. Docker

- `apps/api/Dockerfile` — targets `runner` (API+worker, non-root, prod deps
  only, `/health/live` healthcheck) and `migrate` (one-shot migrate job).
  Build context is the repo root; secrets never copied (`.dockerignore`).
  The Prisma client is generated to `packages/database/generated/` (explicit
  generator `output`, shipped via the package `files` list) because
  `pnpm deploy` does not carry node_modules-generated artifacts — verified
  by booting the deploy tree and running the smoke suite against it.
  Builds need registry egress (`pnpm install` inside the image).
- `apps/web/Dockerfile` — standalone Next server, non-root, build-time
  `NEXT_PUBLIC_*` args only.
- Local prod-like stack: `infrastructure/docker/docker-compose.prod.yml`
  (api + worker + web against Neon/Upstash, health-gated startup). There is
  no dev compose file — local processes talk to Neon/Upstash directly.

```powershell
# .env carries Neon DATABASE_URL + DIRECT_URL here
$env:COOKIE_SECRET = 'long-random-secret'
docker compose -f infrastructure/docker/docker-compose.prod.yml --env-file .env up --build
node scripts/smoke/smoke.mjs   # $env:BASE_URL as needed
```

E2E preconditions (see `apps/api/test/setup-e2e.ts`): a **seeded** database
(`db:deploy` + `db:seed` — specs assume baseline taxonomy/users/problems), a
**fresh Redis** (`FLUSHALL`, or the suite measures the shared throttle
budget instead of the product), and the setup file's dedicated throttle
budget (suites share one Redis; rate limiting itself is covered by unit
tests + the load probe). Suites run **serially** (`--runInBand`): they share
one database and one Redis, and parallel workers flake on Socket.IO timing
and matchmaking cross-talk.

## 5. CI/CD

- PRs (`ci.yml`): frozen install → prettier → lint → typecheck → API+web
  unit tests → Prisma validate → migration-vs-schema drift check → full
  build → `pnpm audit` (high+) → gitleaks → Docker builds (api runner,
  migrate, web). Any failure blocks merge.
- Main (`deploy.yml`): gates re-run → images pushed to GHCR (`-api/-web`,
  `:sha` + `:latest`) → rollout is **manual** (`workflow_dispatch`,
  environment-gated, OIDC `AWS_DEPLOY_ROLE_ARN` — no long-lived keys).
- Swap GHCR→ECR by changing login/push steps; image layout is registry-neutral.

## 6. Migrations (production-safe)

- Dev: `pnpm db:migrate` (`migrate dev`). Staging/prod: **only**
  `prisma migrate deploy` (via the `migrate` image/task). Never `db push`
  outside local dev. CI's `db:validate` (`migrate diff --exit-code` against a
  disposable `SHADOW_DATABASE_URL`) proves `schema.prisma` matches the
  migration history without touching any real database.
- Ordering per deploy: (1) ship backward-compatible app, (2) `migrate
deploy`, (3) verify `/health/ready` + smoke, (4) enable dependent code.
  Destructive changes use expand → migrate data → switch → contract across
  releases. Rollback = redeploy prior image; forward-fix data migrations
  (never `migrate resolve` blindly — see runbook §9).

## 7. PostgreSQL (Neon — the only permanent database)

Single-region rule: Neon, Upstash, S3 and the EC2 host MUST live in the same
AWS region as the users (ap-southeast-1 Singapore for Indian users — the
nearest region Neon offers; Sydney is ~2x farther from India). Measured
2026-10-05: API in India → Neon us-east-2 (Ohio) pays ~800ms TCP connect and
~1.6s per warm query, with parallel queries serializing through the pooler —
a 5-query page costs ~8s before any application work. Same-region Mumbai
brings warm queries to single-digit milliseconds. Region is a bigger lever
than any code optimization; never "fix" cross-region latency with caching.
Neon Postgres with pgvector (supported natively; the RAG migration enables
`vector` idempotently — verify with
`SELECT * FROM pg_extension WHERE extname = 'vector';`). Automated backups +
point-in-time recovery on production; branches per environment (§2).
Connection discipline:

- Runtime (`DATABASE_URL`): Neon **pooled** endpoint + `?pgbouncer=true`
  (Prisma disables prepared statements on the pooler) + `connection_limit=1`
  per process on free tier — 2 Node processes (api + worker) stay within
  Neon's connection budget.
- Migrations (`DIRECT_URL`): Neon **direct** endpoint — DDL cannot run
  through PgBouncer in transaction mode, and Prisma picks `directUrl`
  automatically for `migrate deploy`/`migrate diff`.
- Never run PostgreSQL on EC2 or in compose; CI's docker Postgres exists
  only for isolated shadow/e2e databases.

Constraints, indexes, FKs, and partial uniques ride in migrations —
verified by `db:validate` in CI (disposable shadow database, never a real
one). Monitor in the Neon dashboard: connections, slow queries, storage,
compute usage.

## 8. pgvector operations

Extension installs idempotently in migration `20260919000000_prompt19_ai_rag`
(Neon ships pgvector — verify with `SELECT * FROM pg_extension WHERE
extname = 'vector';`). Dimensions must match `EMBEDDING_MODEL`
(`vector(3072)` for gemini-embedding-001); `problem_embeddings` stores model/dimensions/version/
generatedAt per row. States: `PENDING → PROCESSING → READY | FAILED`.

- New/approved problems: embedded async post-approval (BullMQ).
- Content edits: re-enqueue the problem job (deterministic job id dedupes).
- Failed: rows stay `FAILED` with error; retry via re-enqueue; app serves
  lexical fallback meanwhile.
- Model change: deploy new model config → backfill script enqueues all
  PUBLISHED problems with the new model tag → old rows versioned out, never
  mixed (retrieval filters by current model/version).

## 9. Redis (Upstash) + workers + storage + IAM

- Redis: Upstash with TLS + AUTH token, `noeviction` policy (BullMQ
  correctness), Upstash memory/evictions monitoring. MUST be provisioned in
  the same region as Neon/EC2 (single-region rule, §7) — a cross-region
  Redis adds ~100ms to every throttler check and session lookup. Ephemeral only —
  loss means re-login, cold caches, rebuilt queues; **Neon stays
  authoritative** (recovery table in §10 runbook).
- Workers: ONE `worker` process on EC2 (`node dist/worker`, no ports) —
  challenge, event-notification, AI embedding/review and analytics jobs all
  ride the same process with retries=3 + exponential backoff, deterministic
  job ids, failed jobs at `GET /admin/queues`. Never run a second worker on
  free tier; split only when queue latency proves it necessary.
- Storage: private S3 bucket, presigned GETs (1h), generated keys, upload
  validation (type/size/magic bytes), lifecycle rule for temp prefixes,
  least-privilege IAM (Get/Put on bucket prefix only).
- IAM: one EC2 instance role (api needs S3+Neon+Redis+Secrets; the worker
  shares it; CI needs image-registry deploy only). Neon/Upstash allowlist the
  instance. OIDC for GitHub→AWS; no committed keys.
- Failure behavior (verified 2026-09-17 by stopping Redis against a live
  local API): `/health` → 503 degraded, `/health/live` → 200, PostgreSQL
  reads → 200, login → 503 (sessions are Redis-backed: fail-closed and
  honest, never a false session). Recovery after restart: 200/200 with no
  data repair. This works because the shared Redis client runs with
  `enableOfflineQueue: false` — commands fail fast into explicit fallbacks
  instead of hanging all HTTP traffic. Health checks additionally redial
  proactively (cooldown-guarded): ioredis parks the client permanently after
  any failed (re)connect, so without this one transient blip wedges Redis
  access until process restart.

## 10. WebSocket / domain / HTTPS

- ALB (or reverse-proxy) health check: `GET /api/v1/health/ready`
  (dependency-aware); process liveness: `/health/live` (never touches deps,
  wired to PM2/systemd). Socket.IO needs WebSocket upgrade (default OK) +
  idle timeout ≥ 3600s.
- A single API process needs no stickiness (process-local realtime registry).
  Before scaling API past 1 process, add the Socket.IO Redis adapter and
  replace local realtime state with Redis pub/sub — documented, not yet
  implemented.
- Domain: Route 53 → CloudFront/ALB, ACM certs, `CORS_ORIGINS` + cookie
  domain + Google OAuth callback set to the real `API_URL`; no localhost in
  prod env.

## 11. Observability & alerts

Structured JSONL logs (requestId/userId/route/status/duration) → CloudWatch;
Sentry (API+web, DSN-gated, PII-scrubbed); queue depths in `/health` +
`/admin/queues`; AI usage summaries at `GET /ai/usage`. Alert (actionable
only): 5xx rate, p95 latency, `/ready` 503, worker failed-job growth,
login-failure spikes, embedding-failure rate, RAG fallback rate, Upstash
memory/evictions, Neon connections/storage.

## 12. Backups & disaster recovery

| System                          | Backup                                   | Recovery                                                                             |
| ------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| Neon PostgreSQL (authoritative) | automated backups + PITR (per Neon plan) | restore/branch to point, re-point `DATABASE_URL`, `migrate deploy`, bootstrap verify |
| Redis (ephemeral, Upstash)      | AOF/persistence where useful             | cold start acceptable; users re-login, caches rebuild                                |
| S3 assets                       | versioning + cross-region (recommended)  | version restore; DB holds keys so relink is trivial                                  |
| Failed jobs                     | 24h retention in-queue                   | inspect `/admin/queues`, retry or replay from DB state                               |

Ownership: backend on-call runs DB/queue recovery; content loss (user data)
is impossible by design outside Postgres. RTO/RPO follow Neon PITR (minutes).

Verified restore drill (2026-09-17, pgvector image, non-production):
`pg_dump -Fc` → fresh database → `pg_restore` → `migrate deploy` reported
"no pending migrations", all tables queryable. On Neon the same shape
applies: branch/restore to a point → re-point `DATABASE_URL`/`DIRECT_URL` →
`migrate deploy`. Drill procedure (any Postgres-compatible host):

```powershell
pg_dump -Fc $env:DATABASE_URL -f /tmp/apteez-backup.dump
# restore into a scratch database, then:
$env:DATABASE_URL='<scratch pooled connection>'
$env:DIRECT_URL='<scratch direct connection>'
pnpm --filter @apteez/database db:deploy   # must report no pending migrations
```

## 13. Rollback

App rollback = redeploy previous image tag (migrations are backward
compatible by policy). Data-migration rollback = forward-fix migration, never
editing applied migrations. AI model/config rollback = previous env values;
embeddings stay version-tagged so old vectors remain valid.
Full procedure, responsibilities and what cannot roll back:
`docs/rollback.md`. Migration rules: `docs/migration-safety.md`.

## 14. Post-deploy verification

1. `migrate` task exited 0; `bootstrap` (first install) printed counts.
2. `/health/live` 200, `/health/ready` 200, `/health` shows DB+Redis+queues up.
3. `node scripts/smoke/smoke.mjs` → SMOKE OK.
4. `pnpm smoke:prod` (read-only post-deploy smoke) → PROD-SMOKE OK.
5. `pnpm deploy:verify` (13 steps; automated must pass, manual steps signed
   in the release log) — a deploy is not successful because the container
   started.
6. Controlled staging write: `SMOKE_TARGET=staging SMOKE_ALLOW_WRITES=true
SMOKE_EMAIL=… SMOKE_PASSWORD=… node scripts/smoke/prod-smoke.mjs`.
7. Manual checklist (staging, real accounts): signup/login/OAuth/logout,
   problem submit, challenge duel + reconnect, contest register→rank,
   event register→results, discussion+report+moderate, contribution→AI
   review→approve, points→redemption, admin audit, coach + similar problems +
   review with providers on AND off (fallback), Sentry test event.
8. Monitoring window per `docs/post-launch-monitoring.md` (hour/day/week);
   launch readiness states in `docs/launch-checklist.md`.

Launch operations index: `docs/launch-strategy.md` (pipeline + branch
protection), `docs/feature-flags.md` (kill-switches), `docs/runbooks.md`
(failure playbooks), `docs/incident-response.md`, `docs/alerting.md`,
`docs/prod-data-protection.md`, `docs/ai-quality-loop.md`,
`docs/rag-rollout.md`, `docs/backup-validation.md`,
`docs/observability-correlation.md`, `docs/tech-debt.md`.
