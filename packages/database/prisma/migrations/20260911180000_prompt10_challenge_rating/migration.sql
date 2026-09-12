-- Prompt 10: challenge rating engine. Adds integer ratings, rating-processing
-- state on challenges, the RatingResult vocabulary and an append-only,
-- idempotency-enforcing rating history table.

-- Whole-point ratings everywhere: the engine rounds, so a DOUBLE only invites
-- floating-point drift. Existing values are rounded to the nearest point.
ALTER TABLE "challenge_ratings" ALTER COLUMN "rating" SET DATA TYPE INTEGER USING ROUND("rating")::INTEGER;
ALTER TABLE "challenges" ALTER COLUMN "player1RatingSnapshot" SET DATA TYPE INTEGER USING ROUND("player1RatingSnapshot")::INTEGER;
ALTER TABLE "challenges" ALTER COLUMN "player2RatingSnapshot" SET DATA TYPE INTEGER USING ROUND("player2RatingSnapshot")::INTEGER;
ALTER TABLE "user_ratings" ALTER COLUMN "rating" SET DATA TYPE INTEGER USING ROUND("rating")::INTEGER;

-- A user's result in a rated challenge; stored for indexable history filters.
CREATE TYPE "RatingResult" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- Rating bookkeeping on the challenge. The result itself is committed before
-- rating runs, so this only records whether the idempotent rating step is done.
CREATE TYPE "RatingProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
ALTER TABLE "challenges" ADD COLUMN "ratingStatus" "RatingProcessingStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "challenges" ADD COLUMN "ratingProcessedAt" TIMESTAMPTZ(3);
ALTER TABLE "challenges" ADD COLUMN "ratingAttempts" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "challenges_ratingStatus_idx" ON "challenges"("ratingStatus");

CREATE TABLE "challenge_rating_history" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "domainSlug" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "opponentId" UUID,
    "ratingBefore" INTEGER NOT NULL,
    "ratingAfter" INTEGER NOT NULL,
    "ratingChange" INTEGER NOT NULL,
    "opponentRatingBefore" INTEGER NOT NULL,
    "opponentRatingAfter" INTEGER NOT NULL,
    "outcome" "ChallengeOutcome" NOT NULL,
    "result" "RatingResult" NOT NULL,
    "score" INTEGER NOT NULL,
    "opponentScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "challenge_rating_history_pkey" PRIMARY KEY ("id")
);

-- The unique (challengeId, userId) key makes rating processing idempotent at
-- the database level: a retried job collides instead of double-applying.
CREATE UNIQUE INDEX "challenge_rating_history_challengeId_userId_key" ON "challenge_rating_history"("challengeId", "userId");
CREATE INDEX "challenge_rating_history_userId_createdAt_idx" ON "challenge_rating_history"("userId", "createdAt");
CREATE INDEX "challenge_rating_history_userId_domainSlug_createdAt_idx" ON "challenge_rating_history"("userId", "domainSlug", "createdAt");
CREATE INDEX "challenge_rating_history_userId_result_createdAt_idx" ON "challenge_rating_history"("userId", "result", "createdAt");
CREATE INDEX "challenge_rating_history_challengeId_idx" ON "challenge_rating_history"("challengeId");

-- Leaderboard ordering index: domain + rating DESC + deterministic tiebreak.
DROP INDEX IF EXISTS "challenge_ratings_domainSlug_rating_idx";
CREATE INDEX "challenge_ratings_domainSlug_rating_userId_idx" ON "challenge_ratings"("domainSlug", "rating" DESC, "userId");

ALTER TABLE "challenge_rating_history" ADD CONSTRAINT "challenge_rating_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "challenge_rating_history" ADD CONSTRAINT "challenge_rating_history_opponentId_fkey" FOREIGN KEY ("opponentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "challenge_rating_history" ADD CONSTRAINT "challenge_rating_history_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "challenge_rating_history" ADD CONSTRAINT "challenge_rating_history_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;