# Database migration safety

Every production migration is reviewed for: compatibility with the **previous**
app version (code rollback must always work), table locks, long-running
operations, large rewrites, index impact, and destructive changes.

## Rules

1. **Backward-compatible only.** New tables/columns/indexes: nullable or with
   defaults. Renames and drops go through expand/contract (below). The deploy
   pipeline runs `db:validate` (schema ↔ migrations drift check) and applies
   `migrate deploy` — never `migrate dev` — against production.
2. **No destructive migration ships with an app deploy.** Drop/alter of a
   live column is a separate release _after_ the code stops reading it.
3. **Big tables:** `CREATE INDEX CONCURRENTLY` via raw SQL (Prisma
   `@@index` takes `ACCESS EXCLUSIVE`), backfills in batches with pauses,
   off-peak only. State the expected lock and duration in the PR.
4. **Small, one-purpose migrations** named
   `YYYYMMDDHHMMSS_promptNN_what_changed`. Hand-written SQL must match
   `schema.prisma` exactly — `db:validate` fails the build otherwise
   (allowlisted ORM-opaque artifacts documented in `validate-migrations.mjs`).

## Expand/contract (breaking schema changes)

```
Expand:   add new column/table (nullable) → deploy
Migrate:  backfill in batches → deploy compatible app (writes both, reads new)
Switch:   app reads new exclusively → deploy
Contract: drop old column/table in a LATER release → deploy
```

## Ordering on deploy day

Backward-compatible app (tolerates old + new schema) → `migrate deploy` →
verify → enable new behavior (flag/RC). Rollback = previous image only; the
schema stays (it is compatible by construction).
