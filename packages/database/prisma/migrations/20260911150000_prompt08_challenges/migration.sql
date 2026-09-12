-- 1v1 challenge engine: lifecycle enums, persistent challenge records,
-- server-selected question sets, per-player answers, and per-domain ratings.

CREATE TYPE "ChallengeStatus" AS ENUM ('MATCHMAKING', 'MATCHED', 'COUNTDOWN', 'LIVE', 'COMPLETED', 'CANCELLED', 'ABANDONED', 'EXPIRED');
CREATE TYPE "ChallengeOutcome" AS ENUM ('PLAYER1_WIN', 'PLAYER2_WIN', 'DRAW', 'ABANDONED', 'EXPIRED', 'CANCELLED');
CREATE TYPE "ChallengeCompletionReason" AS ENUM ('COMPLETED', 'TIMER_EXPIRED', 'ABANDONED', 'DISCONNECT_TIMEOUT', 'CANCELLED');

CREATE TABLE "challenges" (
    "id" UUID NOT NULL,
    "domainSlug" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "player1Id" UUID NOT NULL,
    "player2Id" UUID NOT NULL,
    "player1RatingSnapshot" DOUBLE PRECISION NOT NULL,
    "player2RatingSnapshot" DOUBLE PRECISION NOT NULL,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'MATCHMAKING',
    "outcome" "ChallengeOutcome",
    "completionReason" "ChallengeCompletionReason",
    "winnerId" UUID,
    "player1Score" INTEGER,
    "player2Score" INTEGER,
    "player1Correct" INTEGER,
    "player2Correct" INTEGER,
    "player1Wrong" INTEGER,
    "player2Wrong" INTEGER,
    "player1Unanswered" INTEGER,
    "player2Unanswered" INTEGER,
    "questionCount" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "minReadingSeconds" INTEGER NOT NULL,
    "matchedAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "challenge_questions" (
    "id" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "challenge_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "challenge_answers" (
    "id" UUID NOT NULL,
    "challengeId" UUID NOT NULL,
    "challengeQuestionId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "selectedOptionId" UUID,
    "isCorrect" BOOLEAN NOT NULL,
    "answeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responseTimeMs" INTEGER,
    "clientReportedMs" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "challenge_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "challenge_ratings" (
    "userId" UUID NOT NULL,
    "domainSlug" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "challenge_ratings_pkey" PRIMARY KEY ("userId","domainSlug")
);

CREATE INDEX "challenges_player1Id_createdAt_idx" ON "challenges"("player1Id", "createdAt");
CREATE INDEX "challenges_player2Id_createdAt_idx" ON "challenges"("player2Id", "createdAt");
CREATE INDEX "challenges_status_idx" ON "challenges"("status");
CREATE INDEX "challenges_domainSlug_idx" ON "challenges"("domainSlug");
CREATE UNIQUE INDEX "challenge_questions_challengeId_position_key" ON "challenge_questions"("challengeId", "position");
CREATE UNIQUE INDEX "challenge_questions_challengeId_problemId_key" ON "challenge_questions"("challengeId", "problemId");
CREATE INDEX "challenge_questions_challengeId_idx" ON "challenge_questions"("challengeId");
CREATE UNIQUE INDEX "challenge_answers_challengeQuestionId_playerId_key" ON "challenge_answers"("challengeQuestionId", "playerId");
CREATE INDEX "challenge_answers_challengeId_playerId_idx" ON "challenge_answers"("challengeId", "playerId");
CREATE INDEX "challenge_ratings_domainSlug_rating_idx" ON "challenge_ratings"("domainSlug", "rating");
CREATE INDEX "challenge_ratings_categoryId_idx" ON "challenge_ratings"("categoryId");

ALTER TABLE "challenges" ADD CONSTRAINT "challenges_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "challenge_questions" ADD CONSTRAINT "challenge_questions_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "challenge_questions" ADD CONSTRAINT "challenge_questions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "challenge_answers" ADD CONSTRAINT "challenge_answers_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "challenge_answers" ADD CONSTRAINT "challenge_answers_challengeQuestionId_fkey" FOREIGN KEY ("challengeQuestionId") REFERENCES "challenge_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "challenge_answers" ADD CONSTRAINT "challenge_answers_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "challenge_ratings" ADD CONSTRAINT "challenge_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "challenge_ratings" ADD CONSTRAINT "challenge_ratings_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;