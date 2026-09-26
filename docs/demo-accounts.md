# Demo / staging accounts

> **Non-production only.** These credentials work exclusively on databases
> provisioned by `db:seed:staging` (local staging, internal testing, portfolio
> demos). They are intentionally weak, publicly documented here, and must
> never exist in production. The staging seed refuses production databases
> and any database containing non-demo users.

## Password

All five demo accounts share one password (override with `STAGING_PASSWORD`
before seeding; default below is public by design):

```
staging-demo-only
```

## Accounts

| Email                          | Username            | Roles                             | Purpose                                                                                                                         |
| ------------------------------ | ------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `learner@staging.apteez.dev`   | `staging_learner`   | user                              | New learner: 1 solve, favorites, open event registration, pending contribution                                                  |
| `advanced@staging.apteez.dev`  | `staging_advanced`  | user, contributor                 | Active solver: 8-submission history, streak 6, first-solve badge, 45-pt ledger, pending sticker redemption, duel + contest wins |
| `organizer@staging.apteez.dev` | `staging_organizer` | user, organizer                   | Owns the open contest + both events                                                                                             |
| `moderator@staging.apteez.dev` | `staging_moderator` | user, moderator, content_reviewer | Review queue, reports, discussions                                                                                              |
| `admin@staging.apteez.dev`     | `staging_admin`     | user, admin                       | Read-only-friendly admin tour (audit log shows every action)                                                                    |

## Staged scenarios

- Contests: `staging-monsoon-sprint` (past, results + ratings) and
  `staging-weekend-clash` (registration open — the journey registers here).
- Events: `staging-aptitude-night` (public, registration open) and
  `staging-coach-preview` (private draft).
- Contributions: pending, under review, approved (minted problem), rejected.
- Rewards: sticker pack (affordable at 45 pts), paused pro month, 2-left hoodie.
- Discussions: exam/contest/career threads, 2 replies, 1 open SPAM report.

## Reset / reseed

The staging seed is idempotent — re-running is safe and changes nothing:

```powershell
$env:DATABASE_URL='<Neon staging pooled connection>'
$env:DIRECT_URL='<Neon staging direct connection>'
pnpm db:deploy
pnpm db:seed:staging
```

For a from-scratch reset: drop the schema (or the database), `db:deploy`,
`db:seed:staging`. Never run either seed against production: `db:seed`
refuses `NODE_ENV=production`, and `db:seed:staging` additionally refuses
databases with non-demo users.
