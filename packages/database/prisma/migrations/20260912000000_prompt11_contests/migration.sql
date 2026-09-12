-- Prompt 11: multi-user Contest system (part 1: lifecycle + contest columns).
-- Old ContestStatus: DRAFT, SCHEDULED, LIVE, COMPLETED, CANCELLED.
-- New ContestStatus: DRAFT, PUBLISHED, REGISTRATION_OPEN, LIVE, ENDED, CANCELLED, ARCHIVED.
-- Note: the legacy-state remap (SCHEDULED -> PUBLISHED, COMPLETED -> ENDED) lives in
-- the follow-up migration 20260912010000_prompt11_contests_status_remap, because
-- PostgreSQL/Prisma forbid using a freshly-added enum value in the same migration.
ALTER TYPE "ContestStatus" ADD VALUE IF NOT EXISTS 'PUBLISHED';
ALTER TYPE "ContestStatus" ADD VALUE IF NOT EXISTS 'REGISTRATION_OPEN';
ALTER TYPE "ContestStatus" ADD VALUE IF NOT EXISTS 'ENDED';
ALTER TYPE "ContestStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
DO $$ BEGIN
  CREATE TYPE "ContestScoringModel" AS ENUM ('SOLVED_COUNT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ContestResultVisibility" AS ENUM ('ALWAYS', 'AFTER_END', 'AFTER_REGISTRATION_CLOSE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ContestParticipantStatus" AS ENUM ('REGISTERED', 'ACTIVE', 'SUBMITTED', 'AUTO_SUBMITTED', 'DISQUALIFIED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ContestResultStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "ContestSuspiciousEventType" AS ENUM ('TAB_HIDDEN', 'TAB_VISIBLE', 'WINDOW_BLUR', 'WINDOW_FOCUS', 'COPY', 'PASTE', 'FULLSCREEN_ENTER', 'FULLSCREEN_EXIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
ALTER TABLE "contests"
  ADD COLUMN IF NOT EXISTS "rules" TEXT,
  ADD COLUMN IF NOT EXISTS "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS "durationSeconds" INTEGER NOT NULL DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS "registrationOpensAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "registrationClosesAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "questionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "scoringModel" "ContestScoringModel" NOT NULL DEFAULT 'SOLVED_COUNT',
  ADD COLUMN IF NOT EXISTS "resultVisibility" "ContestResultVisibility" NOT NULL DEFAULT 'AFTER_END',
  ADD COLUMN IF NOT EXISTS "revealAnswersLive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "endedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "ratingStatus" "ContestResultStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "ratingProcessedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "ratingAttempts" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS "contests_status_endsAt_idx" ON "contests"("status", "endsAt");
CREATE INDEX IF NOT EXISTS "contests_slug_idx" ON "contests"("slug");
-- Part 2: rename participations -> participants and extend lifecycle columns.
ALTER TABLE "contest_participations" RENAME TO "contest_participants";
ALTER TABLE "contest_participants"
  ADD COLUMN IF NOT EXISTS "status" "ContestParticipantStatus" NOT NULL DEFAULT 'REGISTERED',
  ADD COLUMN IF NOT EXISTS "ratingBefore" INTEGER,
  ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "effectiveEndAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "currentPosition" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "contest_participants" DROP COLUMN IF EXISTS "rank";
ALTER TABLE "contest_participants" DROP COLUMN IF EXISTS "score";
CREATE INDEX IF NOT EXISTS "contest_participants_contestId_status_idx" ON "contest_participants"("contestId", "status");
CREATE INDEX IF NOT EXISTS "contest_participants_contestId_userId_idx" ON "contest_participants"("contestId", "userId");
-- Part 3: frozen question set.
CREATE TABLE IF NOT EXISTS "contest_questions" (
    "id" UUID NOT NULL,
    "contestId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contest_questions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "contest_questions_contestId_position_key" ON "contest_questions"("contestId", "position");
CREATE UNIQUE INDEX IF NOT EXISTS "contest_questions_contestId_problemId_key" ON "contest_questions"("contestId", "problemId");
-- Part 4: per-question answers (idempotent by participant+question).
CREATE TABLE IF NOT EXISTS "contest_answers" (
    "id" UUID NOT NULL,
    "contestId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "contestQuestionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "selectedOptionId" UUID,
    "isCorrect" BOOLEAN,
    "markedForReview" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contest_answers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "contest_answers_participantId_contestQuestionId_key" ON "contest_answers"("participantId", "contestQuestionId");
CREATE INDEX IF NOT EXISTS "contest_answers_contestId_participantId_idx" ON "contest_answers"("contestId", "participantId");
CREATE INDEX IF NOT EXISTS "contest_answers_contestId_userId_idx" ON "contest_answers"("contestId", "userId");
CREATE INDEX IF NOT EXISTS "contest_answers_contestQuestionId_idx" ON "contest_answers"("contestQuestionId");
CREATE INDEX IF NOT EXISTS "contest_answers_participantId_idx" ON "contest_answers"("participantId");
DO $$ BEGIN
  ALTER TABLE "contest_answers" ADD CONSTRAINT "contest_answers_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contest_answers" ADD CONSTRAINT "contest_answers_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "contest_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contest_answers" ADD CONSTRAINT "contest_answers_contestQuestionId_fkey" FOREIGN KEY ("contestQuestionId") REFERENCES "contest_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contest_answers" ADD CONSTRAINT "contest_answers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Part 5: finalized results (exactly one per participant).
CREATE TABLE IF NOT EXISTS "contest_results" (
    "id" UUID NOT NULL,
    "contestId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "solvedCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "unansweredCount" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "completionSeconds" INTEGER NOT NULL,
    "rank" INTEGER,
    "status" "ContestResultStatus" NOT NULL DEFAULT 'PENDING',
    "finalizedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contest_results_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "contest_results_participantId_key" ON "contest_results"("participantId");
CREATE UNIQUE INDEX IF NOT EXISTS "contest_results_contestId_userId_key" ON "contest_results"("contestId", "userId");
CREATE INDEX IF NOT EXISTS "contest_results_contestId_rank_idx" ON "contest_results"("contestId", "rank");
CREATE INDEX IF NOT EXISTS "contest_results_contestId_score_completion_idx" ON "contest_results"("contestId", "score" DESC, "completionSeconds");
-- Part 6: contest rating + auditable history + suspicious events.
CREATE TABLE IF NOT EXISTS "contest_ratings" (
    "userId" UUID NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "contestsPlayed" INTEGER NOT NULL DEFAULT 0,
    "bestRank" INTEGER,
    "lastPlayedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contest_ratings_pkey" PRIMARY KEY ("userId")
);
CREATE INDEX IF NOT EXISTS "contest_ratings_rating_userId_idx" ON "contest_ratings"("rating" DESC, "userId");
DO $$ BEGIN
  ALTER TABLE "contest_ratings" ADD CONSTRAINT "contest_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "contest_rating_history" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "contestId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "ratingBefore" INTEGER NOT NULL,
    "ratingAfter" INTEGER NOT NULL,
    "ratingChange" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "fieldSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "contest_rating_history_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "contest_rating_history_contestId_userId_key" ON "contest_rating_history"("contestId", "userId");
CREATE INDEX IF NOT EXISTS "contest_rating_history_userId_createdAt_idx" ON "contest_rating_history"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "contest_rating_history_contestId_idx" ON "contest_rating_history"("contestId");
DO $$ BEGIN
  ALTER TABLE "contest_rating_history" ADD CONSTRAINT "contest_rating_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contest_rating_history" ADD CONSTRAINT "contest_rating_history_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contest_rating_history" ADD CONSTRAINT "contest_rating_history_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "contest_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "contest_suspicious_events" (
    "id" UUID NOT NULL,
    "contestId" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "type" "ContestSuspiciousEventType" NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,
    CONSTRAINT "contest_suspicious_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "contest_suspicious_events_contestId_createdAt_idx" ON "contest_suspicious_events"("contestId", "createdAt");
CREATE INDEX IF NOT EXISTS "contest_suspicious_events_participantId_idx" ON "contest_suspicious_events"("participantId");
DO $$ BEGIN
  ALTER TABLE "contest_suspicious_events" ADD CONSTRAINT "contest_suspicious_events_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contest_suspicious_events" ADD CONSTRAINT "contest_suspicious_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "contest_results_userId_idx" ON "contest_results"("userId");
DO $$ BEGIN
  ALTER TABLE "contest_results" ADD CONSTRAINT "contest_results_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contest_results" ADD CONSTRAINT "contest_results_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "contest_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contest_results" ADD CONSTRAINT "contest_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "contest_questions_contestId_idx" ON "contest_questions"("contestId");
DO $$ BEGIN
  ALTER TABLE "contest_questions" ADD CONSTRAINT "contest_questions_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "contest_questions" ADD CONSTRAINT "contest_questions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

