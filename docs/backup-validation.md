# Backup validation

A backup is only useful if it restores. Rehearsed 2026-09-17 (non-prod);
repeat quarterly and after any storage-layer change. **Never rehearse
against production.**

## Drill

1. `pg_dump -Fc "$DATABASE_URL" -f /tmp/apteez-backup.dump` (from the backup
   host/job, not the app container).
2. `createdb apteez_restore && pg_restore -d apteez_restore /tmp/apteez-backup.dump`.
3. Point a scratch API at the restored DB: `migrate deploy` must report
   "no pending migrations", the app boots, `/health/ready` is 200.
4. Verify critical tables non-empty and relationally intact: `users`,
   `problems`, `submissions`, `point_transactions`, `reward_redemptions`,
   `contributions`, `contest_results`, `event_participants`.
5. Run `pnpm smoke:prod` against the scratch API (read-only).

## Record

- Restore duration, dump size, any warnings from `pg_restore`.
- Known limitations: point-in-time recovery follows the Neon plan (branches
  are not backups — keep automated backups + PITR on for production); Redis state
  is ephemeral and intentionally not backed up (rebuilds from Postgres +
  backfill); object storage needs its own versioning/lifecycle policy.

## Recovery steps (real incident)

Restore/branch to a point in Neon (or restore the latest verified dump to a
scratch database) → `migrate deploy` → rotate `DATABASE_URL`/`DIRECT_URL` →
rolling restart → `deploy:verify` → monitoring window. RTO/RPO targets are
set at cloud-provisioning time and recorded here afterwards.
