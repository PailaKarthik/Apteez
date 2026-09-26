# Critical failure runbooks

Shape for each: symptoms → checks → immediate mitigation → recovery →
verification. Prefer flag-kills over rollbacks when the surface is gated.

## API unavailable

- Symptoms: `/health/live` non-200, LB targets draining.
- Checks: container logs (redacted JSON), `GET /health/live` vs `/ready`
  (live down = process; ready down = dependency — see below).
- Mitigate: restart service; if bad deploy, roll back (`rollback.md`).
- Recovery: ready 200 with expected `commit` → smoke + verify-deploy.
- Verify: error rate back to baseline, 15 min watch.

## Database unavailable

- Symptoms: `/ready` 503 with `database: down`, 500s on writes.
- Checks: Neon metrics/connections, `migrate` job state, recent deploy.
- Mitigate: read-only degradation is automatic nowhere — this is a P0:
  restore/branch per Neon runbook; do NOT restart the database blindly.
- Recovery: `database: up` on `/ready` → smoke → watch backlog drain.
- Verify: submission/ledger writes succeed; no partial transactions (all
  critical writes are single Postgres transactions — see queue runbook).

## Redis unavailable

- Symptoms: `/ready` 503 `redis: down`, sessions 401, login 503, throttles
  fail open (traffic allowed, abuse window open).
- Checks: Redis process/memory, security-group/networking, client count.
- Mitigate: restore Redis; the app needs no restart (health checks redial
  with cooldown; measured recovery 200/200, no data repair — PostgreSQL is
  the source of truth).
- Recovery: `redis: up`, login works, queue depths readable.
- Verify: smoke; sessions/points/ledger spot-checks.

## BullMQ worker failure / backlog

- Symptoms: `queues.*.failed` climbing on `/ready`, delayed notifications,
  stale embeddings, sweep counters flat.
- Checks: `GET /admin/queues`, worker logs, Redis health, poison job payloads.
- Mitigate: worker restart; drain/remove poison jobs via BullMQ; repeatable
  sweeps are idempotent so re-runs are safe.
- Recovery: failed counts stop growing; backfill chain progresses.
- Verify: enqueue a problem embed on staging; review deferral rows flowing.

## WebSocket failure

- Symptoms: challenge live sync stalls, handshake non-200.
- Checks: `GET /socket.io/?EIO=4&transport=polling` (verify-deploy step 7),
  gateway logs, Redis (live state), ALB sticky-session config.
- Mitigate: challenges remain server-authoritative — HTTP finalize/timer
  paths keep results correct while sockets are down.
- Recovery: handshake 200 + live duel on staging.
- Verify: reconnect storm watch after recovery (event flood guard is
  fail-open; service layer is the backstop).

## Object storage failure

- Symptoms: avatar/asset uploads 5xx, broken image URLs.
- Checks: S3/R2 status, credentials, bucket policy, local disk (dev).
- Mitigate: uploads fail closed with 503; reads of existing keys unaffected
  (local provider) — content stays usable.
- Recovery: test upload on staging.
- Verify: new upload → served URL 200.

## LLM provider outage

- Symptoms: coach fallback spike in `GET /admin/ai/quality`, provider 5xx.
- Checks: provider status page, `ai_usage_logs` errors, latency.
- Mitigate: `FEATURE_AI_PERFORMANCE_COACH=false` redeploy if noise is high;
  deterministic summaries serve either way — profile never breaks.
- Recovery: provider healthy → re-enable gradually (rollout 10 → 50 → unset).
- Verify: fallback rate returns to baseline; spot-check a coach response.

## Embedding provider outage

- Symptoms: embed jobs failing, `problem_embeddings` stuck non-READY.
- Checks: provider status, `/admin/queues` AI failures, backfill dry-run.
- Mitigate: nothing urgent — publishing, lexical search and Similar Problems
  (lexical fallback) all work; jobs retry with backoff.
- Recovery: provider healthy → backlog drains automatically.
- Verify: `readyForTriple` growing in dry-run output; fallback rate normal.

## RAG unavailable (pgvector / retrieval / rerank)

- Symptoms: `lexical-fallback` rate → 1.0 in quality overview, vector errors.
- Checks: pgvector extension/index health, triple mismatch logs
  (`rag.filtered-ineligible`), retrieval latency.
- Mitigate: `FEATURE_AI_SIMILAR_PROBLEMS=false` to stop hammering a sick
  index; lexical fallback serves users meanwhile.
- Recovery: retrieval tests + eval suite green → re-enable.
- Verify: `vector` share recovers; spot-check similar rows are canonical.

## Authentication outage

- Symptoms: mass 401s, login 503/429, session resolve failures.
- Checks: Redis (sessions live there), login-budget keys, auth rate limits,
  recent session/auth deploys.
- Mitigate: Redis down → same as Redis runbook; abuse spike → tighten
  `AUTH_RATE_LIMIT` temporarily (redeploy), never permanent blocks without
  investigation.
- Recovery: login + `/auth/me` on staging; 401 rate back to baseline.
- Verify: `GET /admin/rate-limits` shows the spike decaying.

## Rate-limit spikes

- `GET /admin/rate-limits?hours=1` shows per-endpoint 429s (route templates,
  no raw URLs). One 429 is normal. Investigate: single endpoint × sudden
  10×+ vs baseline, single IP/user behind it (`incident-response.md`
  security path). Never permanently block on 429s alone.
