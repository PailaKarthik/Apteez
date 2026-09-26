# Rollback strategy

## What can be rolled back

- **Application (API, worker, web):** redeploy the previous image tag
  (`ghcr.io/...:<previous-sha>`), then `GET /health/ready` → 200, then
  `pnpm smoke:prod` + `pnpm deploy:verify`. Previous tags are immutable —
  never retag `latest` backwards; deploy the SHA. Typical time: minutes.
- **Feature flags:** redeploy with the flag off (no code change). This is the
  fastest mitigation for AI/rewards/events incidents — prefer it over a full
  rollback when the bad behavior is flag-gated.
- **Worker only:** same image as the API; roll both together (they share the
  build). A worker-only issue (poison job) is usually fixed by draining the
  specific queue via BullMQ + redeploy, not a version rollback.

## What cannot be rolled back

- **Database migrations. Never `migrate resolve --rolled-back` or reverse a
  migration in production.** Every migration must be backward-compatible with
  the previous app version (see `docs/migration-safety.md`), so rolling the
  _code_ back is always safe. Forward-fix data problems with a new migration.
- **Redeemed rewards / spent points / sent notifications / published
  problems.** These are business facts with ledger rows; correct them with
  compensating actions (admin refund/cancel, new migration), not restores.

## Procedure

1. Announce in the incident channel: who is rolling back, from SHA → to SHA.
2. `migrate deploy` is **not** re-run on rollback (old code runs on the
   already-migrated, backward-compatible schema).
3. Deploy previous image → `/health/ready` 200 with expected `commit` →
   smoke + verify-deploy → monitoring window (15 min error-rate watch).
4. Log the rollback in the release log + open a post-incident review.

## Who performs rollback

Release captain (or on-call in a P0). Production environment approval in
GitHub is required even for rollbacks — speed comes from pre-approved RC
tags, not from bypassing the gate.

## Backup validation (last verified 2026-09-17, non-production)

`pg_dump -Fc` → restore to a scratch database → `migrate deploy` →
application connects → smoke green. Full steps: `docs/backup-validation.md`.
Restores are rehearsed, never tested against production.
