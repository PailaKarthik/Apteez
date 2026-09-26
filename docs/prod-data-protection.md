# Production data protection

Dangerous tooling must fail closed against production. Current guard matrix
(verified by reading each entry point — re-verify when adding scripts):

| Script / endpoint                    | Guard                                                                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `db:seed` (dev data)                 | Refuses `NODE_ENV=production` unless `ALLOW_DEV_SEED=true`                                                                                                               |
| `db:seed:staging` (demo data)        | Refuses production unless `STAGING_SEED_ALLOW=true`; refuses non-fresh DB unless `STAGING_SEED_FORCE=true`; synthetic `@staging.apteez.dev` users only                   |
| `db:bootstrap` (structural)          | Production-safe by design (idempotent roles/permissions/taxonomy/rewards); optional `BOOTSTRAP_ADMIN_EMAIL` grants admin — set it once, then unset                       |
| `scripts/smoke/smoke.mjs`            | Must never run against production (comment + journeys use staging)                                                                                                       |
| `scripts/smoke/prod-smoke.mjs`       | Read-only by default; the single write leg requires `SMOKE_TARGET=staging` **and** `SMOKE_ALLOW_WRITES=true` **and** explicit creds — any other combination skips writes |
| `scripts/deploy/verify-deploy.mjs`   | Read-only (handshake + reads + 401-shape checks); manual steps listed, never auto-acked                                                                                  |
| `POST /admin/ai/embeddings/backfill` | Admin + `analytics` area; `?dryRun=true` previews counts with zero writes; version-isolated triple so a rerun cannot corrupt the corpus                                  |
| Journey/load scripts                 | Staging/dev only; e2e setup refuses production-looking databases                                                                                                         |

Rules for new tooling: require explicit environment confirmation, reject
`production` by default, print the target before acting. Reset/delete-all
scripts must not exist without both.
