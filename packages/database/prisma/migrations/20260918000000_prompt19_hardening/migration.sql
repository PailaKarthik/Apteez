-- Prompt 19: cross-cutting production hardening.
-- Index-only migration backing the N+1 and hot-path fixes. All statements
-- are idempotent (IF NOT EXISTS) and additive: no columns change, no rows
-- are touched, write cost grows by a small constant per insert.

-- Submissions: per-user correctness rollups, per-problem stats, and
-- time-windowed sweeps/trending (personalization, problems service, search).
CREATE INDEX IF NOT EXISTS "submissions_userId_status_isCorrect_idx"
  ON "submissions"("userId", "status", "isCorrect");
CREATE INDEX IF NOT EXISTS "submissions_problemId_status_idx"
  ON "submissions"("problemId", "status");
CREATE INDEX IF NOT EXISTS "submissions_status_submittedAt_idx"
  ON "submissions"("status", "submittedAt");

-- Point ledger: type-filtered history and rule-source idempotency lookups.
CREATE INDEX IF NOT EXISTS "point_transactions_userId_type_createdAt_idx"
  ON "point_transactions"("userId", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "point_transactions_userId_sourceType_sourceId_idx"
  ON "point_transactions"("userId", "sourceType", "sourceId");

-- Contest / event participant expiry sweeps (status + effectiveEndAt).
CREATE INDEX IF NOT EXISTS "contest_participants_contestId_status_effectiveEndAt_idx"
  ON "contest_participants"("contestId", "status", "effectiveEndAt");
CREATE INDEX IF NOT EXISTS "event_participants_eventId_status_effectiveEndAt_idx"
  ON "event_participants"("eventId", "status", "effectiveEndAt");

-- Search analytics: per-user recent-search lookups.
CREATE INDEX IF NOT EXISTS "search_events_userId_event_createdAt_idx"
  ON "search_events"("userId", "event", "createdAt");
