# Alerting

Actionable alerts only — every alert names its runbook. Tune thresholds
against one week of staging baseline before paging on them.

## Page (P0/P1)

- API: `GET /health/live` non-200 for 2 min → runbook: API.
- API: 5xx rate > 1% over 5 min (and > 2× baseline) → runbook: API.
- Database: `/ready` `database: down` 2 min → runbook: Database.
- Redis: `/ready` `redis: down` 2 min → runbook: Redis.
- Auth: login 5xx or mass 401 spike (> 5× baseline, 5 min) → runbook: Auth.

## Ticket (P2, next-business-day triage)

- Worker: any queue `failed` growth > 50/hour or delay age > 30 min.
- RAG: `lexical-fallback` share > 80% for 30 min (or `empty` spike).
- AI: coach fallback rate > 50% for 30 min; embedding failure spike.
- Storage: upload 5xx > 5% over 15 min.
- Rate limits: single-endpoint 429s > 10× baseline over 15 min.
- Security: `admin.users` role/status changes outside change windows;
  auth-failure bursts per IP (feeds `incident-response.md`).

## Fatigue policy

No alert without a runbook link and an owner. Flapping alerts get their
threshold doubled or become dashboard warnings — never muted silently.
Weekly review: which alerts fired, which were actionable, what changed.
