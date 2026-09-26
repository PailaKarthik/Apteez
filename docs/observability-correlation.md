# Observability correlation

One request traces across frontend → API → service → DB/Redis → queue →
worker → AI provider via the request id.

- **Origin:** `RequestIdMiddleware` takes `x-request-id` or mints a UUID;
  every response echoes it; `AsyncLocalStorage` carries it through the call.
- **Logs:** `AppLogger` attaches `requestId` to every JSON line (production)
  and every dev line. Secrets are redacted centrally first
  (`common/logger/log-redact.ts`).
- **Errors:** the envelope returns `requestId`; Sentry tags `requestId` +
  route and keeps `{ id, username }` only.
- **Queues:** enqueue sites (`ai-queue`, `event-queue`, `challenge-queue`)
  stamp `requestId` on the payload; processors re-enter the context with
  `runWithJobRequestId`, so worker logs, `ai_usage_logs.requestId`,
  `rag_retrieval_logs.requestId` and `analytics_events.requestId` all join
  back to the originating request.
- **AI:** coach usage rows carry `requestId`, model, latency, tokens,
  `fallbackUsed` and `toolCount`; retrieval rows carry source/count/latency.
- **Admin:** `GET /admin/ai/quality` aggregates by these fields; ad-hoc
  debugging starts from any user-visible `requestId` and greps the
  aggregator across API + worker + Sentry with the same value.
