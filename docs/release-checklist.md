# Release checklist (staging → controlled production)

Check each box with evidence (command output, not memory). Anything unchecked
blocks the release.

## Code

- [ ] `pnpm format:check` passes
- [ ] `pnpm lint` passes (7 tasks)
- [ ] `pnpm typecheck` passes (11 tasks)
- [ ] API unit tests pass (`pnpm --filter @apteez/api test`)
- [ ] Web unit tests pass (`pnpm --filter @apteez/web test`)
- [ ] E2E passes on a seeded database (`pnpm --filter @apteez/api test:e2e`)
- [ ] AI evaluation passes (`GET /admin/ai/evaluations`, version recorded)
- [ ] `pnpm build` (API + web, incl. contest/coach/similar routes)

## Database

- [ ] `db:validate` passes (shadow DB; only allowlisted ORM-opaque drift)
- [ ] `migrate deploy` applied cleanly on a staging copy
- [ ] Fresh-database drill: migrate → bootstrap → seed:staging works
- [ ] Backup/restore drill recorded (see DEPLOYMENT.md §12)

## Security

- [ ] `pnpm audit --prod` triaged (see SECURITY.md; no new fixable highs)
- [ ] gitleaks clean, `.env` untracked, no hardcoded secrets
- [ ] Staging seed refused production (guard verified)

## Infrastructure

- [ ] API/worker Dockerfiles build (needs registry egress)
- [ ] `/health/live` 200, `/health/ready` 200, `/health` shows deps up
- [ ] Smoke suite passes (`scripts/smoke/smoke.mjs` → SMOKE OK)
- [ ] Journey passes on staging (`scripts/journey/journey.mjs` → JOURNEY OK)
- [ ] Sentry DSNs set for the target environment

## AI

- [ ] Provider keys present (staging) or fallbacks verified (coach/RAG/review)
- [ ] Rate limits + budgets configured (`AI_DAILY_LIMIT`, route throttles)
- [ ] Backfill chain works (`POST /admin/ai/embeddings/backfill`)

## Observability

- [ ] Logs shipping with requestId/userId fields
- [ ] `/admin/analytics/overview` returns data
- [ ] `/admin/queues` shows workers processing

## Product

- [ ] Core journeys verified (see journey log)
- [ ] Weekly Targets still Coming Soon (no activation code paths)
- [ ] No AI Tutor surface exists
- [ ] Demo accounts documented in `docs/demo-accounts.md` only

## Documentation

- [ ] README / ARCHITECTURE / WORKING / AI / DEPLOYMENT / SECURITY current
- [ ] Known limitations recorded honestly (see release report)
