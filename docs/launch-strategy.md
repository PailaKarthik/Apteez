# Launch strategy: development → CI → staging → RC → production

## Pipeline

```
feature branch → PR → CI (required) → main → staging (auto) → release candidate
  → production (approved) → smoke test → verify-deploy → monitoring window
```

- **Feature branches never touch production.** Only `main` builds release
  images, and only an explicit `workflow_dispatch` with `deploy_env` rolls an
  environment out (`.github/workflows/deploy.yml`).
- **Staging** tracks `main` and is the only place the controlled write checks
  run (`SMOKE_TARGET=staging`).
- **Release candidate**: a `main` SHA soaked on staging (smoke + journey +
  verify-deploy green, error stream quiet). The SHA — not "latest" — is what
  production deploys.
- **Production** deploys the RC image by tag (`ghcr.io/...-api:<sha>`), then
  `migrate deploy`, then smoke + `deploy:verify`, then the monitoring window
  (`docs/post-launch-monitoring.md`). A deploy is not successful because the
  container started — see `scripts/deploy/verify-deploy.mjs` (13 steps, 6 of
  which need a human sign-off in the release log).

## Required repository settings (GitHub UI — cannot be coded)

- Branch protection on `main`: require pull request before merging (≥1
  approval), require status checks (`ci.yml` gates), dismiss stale approvals,
  no direct pushes, no bypass except the release captain in an incident
  (documented in the incident log).
- `staging` and `production` **environments** with required reviewers
  (production: tech lead + one more). The rollout job already declares
  `environment: ${{ inputs.deploy_env }}` so these gates actually bind.

## Release identity

Every image bakes `GIT_SHA` (CI `--build-arg`, see `deploy.yml`); task
definitions must also set `APP_VERSION` and, for tagged releases,
`RELEASE_TAG`. `/health` exposes `{ version, commit, tag }` — no secrets, no
URLs. `verify-deploy` step 1 fails the deploy when the running commit does
not match `EXPECT_COMMIT`. Local builds report `commit: "unknown"`; that is
fine locally and a release blocker in production.

## Rollback, incidents, monitoring

- Rollback: `docs/rollback.md`. Database: `docs/migration-safety.md`.
- Incidents: `docs/incident-response.md`. Failure playbooks: `docs/runbooks.md`.
- Alerts: `docs/alerting.md`. Launch readiness: `docs/launch-checklist.md`.

## Explicitly out of scope

- **Weekly Targets** stays "Coming Soon" (web `targets` page + home row).
  There is no flag and no backend for it; enabling it means building the
  feature under a new flag, not flipping hidden code.
- **AI Tutor** remains deferred. The three AI capabilities are Performance
  Coach, Similar Problems RAG, and Contribution Review — each independently
  killable (`docs/feature-flags.md`).
