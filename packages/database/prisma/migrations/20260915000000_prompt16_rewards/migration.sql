-- Prompt 16: Points + Rewards + Redemption system.
-- Extends the ledger (source/description/metadata, REVERSAL/REFUND types),
-- adds the transactionally-synced UserPoints mirror, data-driven RewardRules,
-- the Reward catalog, RewardRedemption records, and reward notification types.
-- Existing ledger rows and achievement definitions are preserved untouched.

-- 1. Enum additions (additive only; existing values keep working).
ALTER TYPE "PointTransactionType" ADD VALUE IF NOT EXISTS 'REVERSAL';
ALTER TYPE "PointTransactionType" ADD VALUE IF NOT EXISTS 'REFUND';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POINTS_EARNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REWARD_REDEEMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REWARD_REFUNDED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'POINTS_ADJUSTED';
DO $$ BEGIN
  CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'PROCESSING', 'FULFILLED', 'CANCELLED', 'FAILED', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Ledger attribution columns.
ALTER TABLE "point_transactions"
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceId" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;
CREATE INDEX IF NOT EXISTS "point_transactions_userId_reason_createdAt_idx"
  ON "point_transactions"("userId", "reason", "createdAt");
-- Partial unique index: retries of the same (user, source, type) collide
-- instead of double-awarding. NULL sourceIds stay unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS "point_transactions_user_source_unique"
  ON "point_transactions"("userId", "sourceType", "sourceId", "type")
  WHERE "sourceId" IS NOT NULL;

-- 3. Synchronized balance mirror.
CREATE TABLE IF NOT EXISTS "user_points" (
  "userId" UUID NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "lifetimeEarned" INTEGER NOT NULL DEFAULT 0,
  "lifetimeSpent" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_points_pkey" PRIMARY KEY ("userId")
);
DO $$ BEGIN
  ALTER TABLE "user_points" ADD CONSTRAINT "user_points_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Backfill mirrors from the existing ledger so balances never drift at cutover.
INSERT INTO "user_points" ("userId", "balance", "lifetimeEarned", "lifetimeSpent")
SELECT
  "userId",
  COALESCE((SELECT "balanceAfter" FROM "point_transactions" t2
            WHERE t2."userId" = t."userId"
            ORDER BY t2."createdAt" DESC, t2."id" DESC LIMIT 1), 0),
  COALESCE(SUM("amount") FILTER (WHERE "type" = 'EARN'), 0),
  COALESCE(-SUM("amount") FILTER (WHERE "type" = 'SPEND'), 0)
FROM "point_transactions" t
GROUP BY "userId"
ON CONFLICT ("userId") DO NOTHING;

-- 4. Reward rules (centralized, server-owned amounts and caps).
CREATE TABLE IF NOT EXISTS "reward_rules" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "points" INTEGER NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'activity',
  "dailyCap" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reward_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "reward_rules_key_key" ON "reward_rules"("key");
INSERT INTO "reward_rules" ("id", "key", "name", "description", "points", "category", "dailyCap", "isActive", "createdAt", "updatedAt")
VALUES
  ('b0000000-0000-4000-8000-000000000001', 'onboarding', 'Onboarding Completed', 'Complete your profile and join the community.', 50, 'onboarding', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-8000-000000000002', 'problem-solve', 'Problem Solved', 'Solve a practice problem correctly.', 5, 'activity', 20, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-8000-000000000003', 'challenge-complete', 'Challenge Completed', 'Finish a rated 1v1 challenge.', 10, 'activity', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-8000-000000000004', 'contest-participate', 'Contest Participation', 'Submit a contest entry.', 10, 'activity', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('b0000000-0000-4000-8000-000000000005', 'event-participate', 'Event Participation', 'Submit an event entry.', 10, 'activity', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "points" = EXCLUDED."points",
  "category" = EXCLUDED."category",
  "dailyCap" = EXCLUDED."dailyCap",
  "updatedAt" = CURRENT_TIMESTAMP;

-- 5. Reward catalog (physical fulfillment deferred; fields are ready).
CREATE TABLE IF NOT EXISTS "rewards" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'merch',
  "pointsCost" INTEGER NOT NULL,
  "imageKey" TEXT,
  "stockQuantity" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rewards_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "rewards_isActive_idx" ON "rewards"("isActive");
INSERT INTO "rewards" ("id", "name", "description", "category", "pointsCost", "stockQuantity", "isActive", "createdAt", "updatedAt")
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'ApteeZ Study Notebook', 'Branded dot-grid notebook for rough work and revision.', 'stationery', 500, 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000002', 'ApteeZ Study Planner', '12-week study planner with aptitude milestones.', 'stationery', 800, 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000003', 'ApteeZ Pen Set', 'Branded 5-pen study accessory set.', 'stationery', 300, 200, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000004', 'Aptitude Mastery Book', 'Curated aptitude book covering all seven domains.', 'books', 2000, 40, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000005', 'ApteeZ T-Shirt', 'Branded cotton T-shirt.', 'apparel', 1500, 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('c0000000-0000-4000-8000-000000000006', 'ApteeZ Hoodie', 'Branded winter hoodie.', 'apparel', 3000, 25, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- 6. Redemption records.
CREATE TABLE IF NOT EXISTS "reward_redemptions" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "rewardId" UUID NOT NULL,
  "pointsCost" INTEGER NOT NULL,
  "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ(3),
  "cancelledAt" TIMESTAMPTZ(3),
  "metadata" JSONB,
  CONSTRAINT "reward_redemptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "reward_redemptions_userId_createdAt_idx" ON "reward_redemptions"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "reward_redemptions_status_idx" ON "reward_redemptions"("status");
DO $$ BEGIN
  ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_rewardId_fkey"
    FOREIGN KEY ("rewardId") REFERENCES "rewards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Retries with the same key return the existing redemption instead of charging twice.
CREATE UNIQUE INDEX IF NOT EXISTS "reward_redemptions_user_key_unique"
  ON "reward_redemptions"("userId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
