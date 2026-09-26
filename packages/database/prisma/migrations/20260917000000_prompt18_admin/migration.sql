-- Prompt 18: Admin Panel + Moderation + Platform Operations.
-- Adds the append-only admin audit log, the centralized report queue,
-- structured contribution AI reviews, contributor feedback, user suspension
-- fields, and moderation notification types. No existing rows are touched.

-- 1. New enums.
DO $$ BEGIN
  CREATE TYPE "AiReviewRecommendation" AS ENUM ('APPROVE', 'REVIEW', 'REJECT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ReportTargetType" AS ENUM ('PROBLEM', 'CONTRIBUTION', 'DISCUSSION_POST', 'DISCUSSION_REPLY', 'EVENT', 'CONTEST', 'USER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ReportPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Moderation notification types (additive only).
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTRIBUTION_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTRIBUTION_REJECTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTRIBUTION_CHANGES_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MODERATION_ACTION';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REPORT_RESOLVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CONTEST_CANCELLED';

-- 3. Contribution feedback + AI reviews.
ALTER TABLE "contributions"
  ADD COLUMN IF NOT EXISTS "feedbackForContributor" TEXT;
CREATE TABLE IF NOT EXISTS "contribution_ai_reviews" (
  "id" UUID NOT NULL,
  "contributionId" UUID NOT NULL,
  "model" TEXT NOT NULL,
  "suggestedTopic" TEXT,
  "suggestedSubtopic" TEXT,
  "suggestedDifficulty" "Difficulty",
  "duplicateProbability" DOUBLE PRECISION,
  "answerConsistent" BOOLEAN,
  "issues" JSONB,
  "recommendation" "AiReviewRecommendation" NOT NULL DEFAULT 'REVIEW',
  "rawResponse" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contribution_ai_reviews_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "contribution_ai_reviews_contributionId_createdAt_idx"
  ON "contribution_ai_reviews"("contributionId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "contribution_ai_reviews" ADD CONSTRAINT "contribution_ai_reviews_contributionId_fkey"
    FOREIGN KEY ("contributionId") REFERENCES "contributions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. User suspension fields.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "suspendedUntil" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "statusReason" TEXT;

-- 5. Centralized report queue.
CREATE TABLE IF NOT EXISTS "reports" (
  "id" UUID NOT NULL,
  "reporterId" UUID NOT NULL,
  "targetType" "ReportTargetType" NOT NULL,
  "targetId" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "description" TEXT,
  "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "ReportPriority" NOT NULL DEFAULT 'NORMAL',
  "assignedModeratorId" UUID,
  "resolution" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "reports_status_createdAt_idx" ON "reports"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "reports_targetType_targetId_idx" ON "reports"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "reports_reporterId_idx" ON "reports"("reporterId");
DO $$ BEGIN
  ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey"
    FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "reports" ADD CONSTRAINT "reports_assignedModeratorId_fkey"
    FOREIGN KEY ("assignedModeratorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- One open-or-reviewing report per (reporter, target): prevents queue spam
-- while still allowing a fresh report after resolution.
CREATE UNIQUE INDEX IF NOT EXISTS "reports_reporter_target_open_unique"
  ON "reports"("reporterId", "targetType", "targetId")
  WHERE "status" IN ('OPEN', 'UNDER_REVIEW');

-- 6. Admin audit log (append-only from the application layer).
CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" UUID,
  "previousValue" JSONB,
  "newValue" JSONB,
  "reason" TEXT,
  "ip" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "admin_audit_logs_actorUserId_createdAt_idx"
  ON "admin_audit_logs"("actorUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_createdAt_idx"
  ON "admin_audit_logs"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_targetType_targetId_idx"
  ON "admin_audit_logs"("targetType", "targetId");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_createdAt_idx" ON "admin_audit_logs"("createdAt");
DO $$ BEGIN
  ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
