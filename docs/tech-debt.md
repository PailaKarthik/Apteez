# Technical debt register

Real known items only. Severity = user/ops impact if left alone.

## High

- **No password change/reset flow.** Auth has register/login/logout only.
  Workaround: session revoke on suspend/ban + admin-driven recovery.
  Action: add change-password (revoking other sessions) + reset via email
  before public launch sign-up opens wide.
- **Contribution reviewer worker deferred.** `handleContributionReview`
  records a deferral row; all reviews are human. Workaround: manual queue
  (fine at current volume). Action: land the LLM reviewer behind
  `AI_CONTRIBUTION_REVIEW` when quality data justifies it.
  (2026-09-18: superseded — the reviewer IS implemented in
  `ai.processor.ts`: when `AI_CONTRIBUTION_REVIEW` is on and a provider is
  configured, it stores a structured advisory `ContributionAiReview`;
  otherwise it records an honest deferral and the contribution stays
  PENDING. Human approval remains mandatory either way.)

## Medium

- **Session revoke is best-effort when Redis is down.** Suspension itself is
  PG-enforced on next request, but live-token kill needs Redis. Workaround:
  none needed beyond the guard check. Action: short-lived access semantics
  if session lifetimes ever grow.
- **RAG serves lexical fallback until embedding keys exist.** Retrieval,
  filtering and rerank are proven; vectors need provider keys + backfill.
  Workaround: lexical fallback (verified). Action: configure keys, dry-run,
  backfill, watch `vector` share in quality overview (see `rag-rollout.md`).
- **Rate-limit aggregates live in Redis with TTLs** (25h minute / 8d day
  buckets). History beyond that needs the log aggregator. Fine for incident
  use; do not treat as analytics.
- **Challenge liveness timers are in-process memory** (`challenge.coordinator`
  Maps: countdown ticks, matchmaking sweeps, disconnect grace). A restart or
  second API instance loses them; only the BullMQ `expire` backstop survives.
  Workaround: single API task (documented in DEPLOYMENT.md §10). Action:
  Socket.IO Redis adapter + Redis-backed timers before scaling API past
  1 task.
- **Dead `UserRating` / `RatingHistory` models** (`schema.prisma`) are never
  read or written; live paths use `ChallengeRating` / `ContestRating` (+
  histories). Workaround: none (unused tables). Action: drop in a
  backward-compatible migration when touching the rating schema next.
- **Embedding backfill skips stale-triple READY rows.** After an
  `EMBEDDING_MODEL`/`DIMENSIONS` rotation the backfill worker only pages
  missing rows, so version-mismatched READY rows rely on the retrieval-time
  triple filter (safe: excluded, lexical fallback serves). Action: add a
  version-scoped sweep to the backfill chain at rotation time.

## Low

- **Cosmetic `challenge.socket.shutdown-failed` warning** on shutdown
  (predates Prompt 24; sockets close cleanly). Action: guard the destroy
  path when touching the gateway next.
- **Release-checklist duplication:** `docs/release-checklist.md` (RC) vs
  `docs/launch-checklist.md` (launch readiness). Keep both; the RC one feeds
  the launch one.
- **Staging-write smoke needs throwaway creds** (`SMOKE_EMAIL/PASSWORD`).
  Action: dedicated staging bot account in CI secrets at cloud-provision time.
- **Dependency advisories concentrate in the dev chain** (`pnpm audit`
  reports highs in Next/esbuild/glob/tmp/vite transitive paths; no high in
  the production request path). Action: scheduled Next.js + lockfile upgrade
  as maintenance with full regression, not as a launch blocker.
