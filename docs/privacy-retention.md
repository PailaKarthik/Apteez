# Privacy & data retention

PostgreSQL is the source of truth; Redis holds only ephemeral state with
TTLs; object storage holds binary keys referenced from the database.

## What is retained

- **Accounts & content** (users, problems, submissions, contests, events,
  discussions, contributions, rewards ledger, audit logs): retained while the
  account exists. Deactivation sets `users.isActive=false`; audit and ledger
  rows are append-only and never deleted through any API.
- **Discussions**: soft delete (`deletedAt`) so moderation stays reversible.
- **Request logs**: structured JSONL via AppLogger; keep 30 days in
  production log shipping, then drop. Never log passwords, tokens, cookies,
  authorization headers, or OAuth secrets.
- **AI telemetry** (`AiUsageLog`, `ai-observability` logs): feature, model,
  latency, token counts, success/failure, validation result — no full prompts
  or private profiles. Keep 90 days, then aggregate/drop.
- **Analytics** (`SearchEvent`, `UserActivityDaily`): derived counters only.
  Raw search strings are truncated server-side; keep 180 days, then roll up.
- **Failed BullMQ jobs**: retained per queue defaults
  (`removeOnFail { age: 24h, count: 1000 }`), inspectable at
  `GET /admin/queues` and `GET /admin/queues/:queue/failed`.
- **Redis ephemeral state**: sessions (sliding TTL), rate-limit counters
  (60s–24h TTLs), matchmaking/live state (minutes), AI budget counters
  (24h), AI response caches (10–60 min). All expire automatically; Redis
  loss never corrupts PostgreSQL.

## What is never persisted

- Plaintext passwords (scrypt hashes only), session tokens (SHA-256 hashes
  in Redis), provider secrets, LLM API keys (env/secrets manager only),
  full AI prompts/responses, raw file bytes in the database (object keys
  only).

## Erasure

Account deletion is deactivation + PII scrub on request (email/username
rotated to tombstones); ledger/audit rows keep non-identifying references
for accountability. Object keys owned by the user are deleted best-effort.
