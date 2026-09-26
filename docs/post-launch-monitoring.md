# Post-launch monitoring window

Only observed data is reported — no fake launch metrics. Sources: Sentry,
JSON logs (requestIds), `/health`, `/admin/queues`, `/admin/ai/quality`,
`/admin/rate-limits`, `analytics_events`, user feedback.

## First hour (release captain + on-call)

- `/health/live` 200, `/ready` 200 with expected `commit`; error rate vs
  pre-deploy baseline; auth success/failure ratio; database latency +
  connections; Redis latency + evictions; worker heartbeats + failed counts;
  socket.io handshake; the 13 `deploy:verify` steps signed off.

## First day

- Core usage: attempts started/submitted, challenge matches, contest entries,
  event registrations, contribution submits, redemptions.
- Failures: 5xx by endpoint, 429 spikes (`/admin/rate-limits`), queue failed
  growth, notification delays, embed backlog.
- AI/RAG: coach fallback rate + latency + tool-call averages, similar
  `vector` vs `lexical-fallback` vs `empty` shares, review deferral count
  (100% deferred is expected until the reviewer worker lands).
- Feedback queue triaged (`/admin/feedback`).

## First week

- Retention/engagement from `analytics_events` (activation → practice →
  compete → return); contribution quality (approve/reject ratio, admin
  override agree/disagree); contest/challenge participation; AI verdict
  signals (`helpful`/`relevant` shares — signals, not scores); repeat
  incidents → tech-debt or flag changes.

## Iteration discipline

Problem → evidence → hypothesis → small change → flag → staging →
release → measure → decide. The loop is Practice → Compete → Get Rated →
Understand Weaknesses → Improve → Return; features outside it need evidence.
