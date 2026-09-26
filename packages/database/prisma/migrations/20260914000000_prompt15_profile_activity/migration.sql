-- Prompt 15: Profile + Performance Analytics + Streaks + Achievements.
-- Adds user timezone/privacy columns, data-driven achievement metadata, the
-- UserActivityDaily rollup table, and seeds the canonical achievement set.
-- All rollup rows are derived from authoritative records (submissions,
-- challenge/contest/event results, learning progress, point ledger).

-- 1. Profile columns on users.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "timezone" TEXT,
  ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- 2. Data-driven achievement metadata.
ALTER TABLE "achievements"
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- 3. Daily activity rollup.
CREATE TABLE IF NOT EXISTS "user_activity_daily" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "date" DATE NOT NULL,
  "problemsAttempted" INTEGER NOT NULL DEFAULT 0,
  "problemsSolved" INTEGER NOT NULL DEFAULT 0,
  "challengesPlayed" INTEGER NOT NULL DEFAULT 0,
  "challengeWins" INTEGER NOT NULL DEFAULT 0,
  "contestsAttempted" INTEGER NOT NULL DEFAULT 0,
  "eventsJoined" INTEGER NOT NULL DEFAULT 0,
  "lessonsCompleted" INTEGER NOT NULL DEFAULT 0,
  "pointsEarned" INTEGER NOT NULL DEFAULT 0,
  "totalActivityCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_activity_daily_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_activity_daily_userId_date_key" ON "user_activity_daily"("userId", "date");
CREATE INDEX IF NOT EXISTS "user_activity_daily_userId_date_idx" ON "user_activity_daily"("userId", "date");
DO $$ BEGIN
  ALTER TABLE "user_activity_daily" ADD CONSTRAINT "user_activity_daily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Canonical achievement definitions (idempotent; safe to re-apply).
INSERT INTO "achievements" ("id", "key", "name", "description", "category", "metadata", "points", "isActive", "createdAt", "updatedAt")
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'first-solve', 'First Problem', 'Solve your first aptitude problem.', 'solving', '{"solved": 1}', 10, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000002', 'solve-100', 'Century Solver', 'Solve 100 problems.', 'solving', '{"solved": 100}', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000003', 'solve-500', 'Prolific Solver', 'Solve 500 problems.', 'solving', '{"solved": 500}', 150, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000004', 'solve-1000', 'Master Solver', 'Solve 1000 problems.', 'solving', '{"solved": 1000}', 300, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000005', 'rating-1500', 'Rising Talent', 'Reach 1500 challenge rating in any domain.', 'rating', '{"rating": 1500}', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000006', 'streak-30', 'Consistent 30', 'Hold a 30-day activity streak.', 'streak', '{"streak": 30}', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000007', 'streak-50', 'Unstoppable 50', 'Hold a 50-day activity streak.', 'streak', '{"streak": 50}', 200, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000008', 'streak-100', 'Centurion Streak', 'Hold a 100-day activity streak.', 'streak', '{"streak": 100}', 400, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000009', 'challenge-winner', 'Challenge Winner', 'Win your first 1v1 challenge.', 'challenge', '{"wins": 1}', 25, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000010', 'contest-top-10', 'Contest Top 10', 'Finish in the top 10 of a contest.', 'contest', '{"rank": 10}', 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000011', 'first-contest', 'Contest Debut', 'Enter your first contest.', 'contest', '{"contests": 1}', 15, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000012', 'first-event', 'Event Explorer', 'Join your first community event.', 'events', '{"events": 1}', 15, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('a0000000-0000-4000-8000-000000000013', 'contribution-approved', 'Approved Contributor', 'Get a contributed question approved.', 'contribution', '{"approved": 1}', 50, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "category" = EXCLUDED."category",
  "metadata" = EXCLUDED."metadata",
  "points" = EXCLUDED."points",
  "updatedAt" = CURRENT_TIMESTAMP;
