-- Dynamic reward rules (trigger-based multi-rule awards) + event provenance/codes.

-- 1. RewardRule: firing trigger + lifetime/cooldown/validity knobs.
ALTER TABLE "reward_rules" ADD COLUMN "trigger" TEXT NOT NULL DEFAULT 'manual';
-- Backfill: every existing rule fires on its own key (preserves behavior).
UPDATE "reward_rules" SET "trigger" = "key" WHERE "trigger" = 'manual';
ALTER TABLE "reward_rules" ADD COLUMN "maxPerUser" INTEGER;
ALTER TABLE "reward_rules" ADD COLUMN "cooldownSeconds" INTEGER;
ALTER TABLE "reward_rules" ADD COLUMN "validFrom" TIMESTAMPTZ(3);
ALTER TABLE "reward_rules" ADD COLUMN "validTo" TIMESTAMPTZ(3);
CREATE INDEX IF NOT EXISTS "reward_rules_trigger_isActive_idx"
  ON "reward_rules"("trigger", "isActive");

-- 2. Per-rule idempotency: several rules may now award on the same source
-- (e.g. two "problem-solve" rules on one submission). Scope the partial
-- unique index by reason ("rule:<key>") so each rule stays exactly-once.
-- Superset of the old key — existing rows keep satisfying it.
DROP INDEX IF EXISTS "point_transactions_user_source_unique";
CREATE UNIQUE INDEX "point_transactions_user_source_unique"
  ON "point_transactions"("userId", "sourceType", "sourceId", "type", "reason")
  WHERE "sourceId" IS NOT NULL;

-- 3. Events: official/community provenance + private entry codes.
ALTER TABLE "events" ADD COLUMN "isOfficial" BOOLEAN NOT NULL DEFAULT false;
-- Every existing event was admin-created (creation was admin-only).
UPDATE "events" SET "isOfficial" = true;
ALTER TABLE "events" ADD COLUMN "entryCode" TEXT;
