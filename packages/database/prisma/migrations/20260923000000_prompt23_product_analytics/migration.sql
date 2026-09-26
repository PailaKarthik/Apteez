-- Prompt 23: product analytics foundation.
--
-- A single append-only `analytics_events` table backs activation, engagement,
-- funnel, and retention queries. Verbose domain telemetry (search, AI usage)
-- keeps its own tables; this one records coarse product milestones only.
-- Rows reference users with ON DELETE CASCADE so account removal scrubs
-- analytics automatically. Never seed this table: demo/staging journeys
-- generate real rows by exercising the API.

CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "userId" UUID,
  "metadata" JSONB,
  "requestId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "analytics_events_name_createdAt_idx"
  ON "analytics_events"("name", "createdAt");
CREATE INDEX IF NOT EXISTS "analytics_events_userId_createdAt_idx"
  ON "analytics_events"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "analytics_events_userId_name_createdAt_idx"
  ON "analytics_events"("userId", "name", "createdAt");
DO $$ BEGIN
  ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
