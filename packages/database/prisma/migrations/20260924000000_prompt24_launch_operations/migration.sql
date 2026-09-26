-- Prompt 24: production-launch operations layer.
--
-- Three append-only operational tables plus additive AI-usage columns:
-- - `feedback`: lightweight user-reported issues/feedback (nullable user for
--   anonymous reports). Rows survive account removal (SET NULL) so the ops
--   queue keeps context; they carry no secrets by validation.
-- - `ai_feedback`: per-user quality signals for AI features (helpful /
--   relevant / review-override). Advisory signals only — never ground truth.
--   Rows die with the user (CASCADE).
-- - `rag_retrieval_logs`: per-request Similar Problems retrieval telemetry
--   (source, result count, latency). No prompts, queries, or content.
-- - `ai_usage_logs` gains `fallbackUsed`, `toolCount`, `requestId` so the
--   quality endpoints can report fallback rates, tool-call pressure, and
--   cross-service correlation without touching existing columns.
-- Never seed these tables: rows are produced by real API/queue activity.

CREATE TABLE IF NOT EXISTS "feedback" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "page" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "feedback_status_createdAt_idx"
  ON "feedback"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "feedback_userId_createdAt_idx"
  ON "feedback"("userId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ai_feedback" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "feature" TEXT NOT NULL,
  "targetId" UUID,
  "verdict" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ai_feedback_feature_createdAt_idx"
  ON "ai_feedback"("feature", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_feedback_userId_createdAt_idx"
  ON "ai_feedback"("userId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "ai_feedback" ADD CONSTRAINT "ai_feedback_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "rag_retrieval_logs" (
  "id" UUID NOT NULL,
  "problemId" UUID,
  "source" TEXT NOT NULL,
  "resultCount" INTEGER NOT NULL,
  "latencyMs" INTEGER,
  "requestId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rag_retrieval_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "rag_retrieval_logs_createdAt_idx"
  ON "rag_retrieval_logs"("createdAt");
CREATE INDEX IF NOT EXISTS "rag_retrieval_logs_source_createdAt_idx"
  ON "rag_retrieval_logs"("source", "createdAt");

ALTER TABLE "ai_usage_logs" ADD COLUMN IF NOT EXISTS "fallbackUsed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_usage_logs" ADD COLUMN IF NOT EXISTS "toolCount" INTEGER;
ALTER TABLE "ai_usage_logs" ADD COLUMN IF NOT EXISTS "requestId" TEXT;
