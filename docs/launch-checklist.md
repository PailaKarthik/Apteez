# Launch checklist

States: `NOT_STARTED` | `IN_PROGRESS` | `READY` | `BLOCKED`. Nothing is
marked READY automatically — each line needs a name, a date, and evidence
(command output, dashboard link, or doc reference). Honest snapshot for the
local release candidate, 2026-09-18:

| Category       | Item                                       | State       | Evidence                                                               |
| -------------- | ------------------------------------------ | ----------- | ---------------------------------------------------------------------- |
| Infrastructure | CI gates green (lint/typecheck/unit/e2e)   | READY       | 255 unit, 103 e2e, gates in `ci.yml`                                   |
| Infrastructure | Images build + push by SHA                 | IN_PROGRESS | Dockerfiles OK; registry push runs in CI (no egress verified locally)  |
| Infrastructure | Staging tracks main; prod approved         | IN_PROGRESS | Workflow gates code; GitHub env reviewers must be set in repo settings |
| Infrastructure | Release identity on /health                | READY       | `commit`/`tag` live; CI injects `GIT_SHA`                              |
| Database       | Migrations clean + backward-compatible     | READY       | `db:validate` allowlisted-only drift                                   |
| Database       | Backup + restore rehearsed (non-prod)      | READY       | `docs/backup-validation.md`, drill 2026-09-17                          |
| Security       | Secrets out of code/logs                   | READY       | Central redaction + spec; Sentry scrubs; audit clean                   |
| Security       | RBAC + session revoke on suspend           | READY       | Verified live (suspend → 401 → reactivate)                             |
| Security       | Rate-limit observability                   | READY       | `GET /admin/rate-limits` + runbook                                     |
| Authentication | Register/login/session/OAuth-degraded      | READY       | E2E + live login/me checks                                             |
| Core Product   | Practice/submit/server-scored              | READY       | E2E + staging-write smoke leg                                          |
| Competition    | Challenge live + contest reads             | READY       | E2E socket flows + smoke                                               |
| Community      | Discussions/moderation/reports             | READY       | Prior prompts; audit-logged                                            |
| Events         | Discovery + registration, flag-gated       | READY       | Kill verified (anon 503, authed OK)                                    |
| Rewards        | Catalog/rules/redeem, flag-gated           | READY       | Kill verified (503); ledger transactional                              |
| Search         | Lexical + trending + filters               | READY       | E2E + smoke                                                            |
| AI             | Coach serves; flag kill → deterministic    | READY       | Verified live; fallback rows recorded                                  |
| RAG            | Retrieval + rerank + lexical fallback      | READY       | Eval 17/17; fallback serving verified live                             |
| Observability  | Logs/Sentry/quality/flags/queues endpoints | READY       | Redacted JSON logs; dashboards listed in `alerting.md`                 |
| Documentation  | Runbooks/rollback/incidents/launch docs    | READY       | This directory                                                         |
| Product ops    | Feedback intake + triage + AI signals      | READY       | Verified live incl. 422 guards                                         |
| Blockers       | Cloud provisioning (Neon/Upstash/EC2)      | BLOCKED     | No cloud access from this environment — first real deploy needs it     |
| Blockers       | Password change/reset flow                 | NOT_STARTED | See `tech-debt.md`; compromise response = revoke + admin flow          |

Weekly Targets: Coming Soon (no backend, no flag). AI Tutor: deferred.
