-- Prompt 20: schema baseline — reconcile the database with schema.prisma.
--
-- Prior prompts evolved schema.prisma (contest renames, answer idempotency
-- indexes, updatedAt semantics, enum states) without companion migrations,
-- so `migrate diff` reported drift. This migration applies the schema-side
-- changes verbatim (statements below were reviewed from the generated diff).
--
-- INTENTIONALLY EXCLUDED (load-bearing artifacts the ORM cannot express;
-- declared as Unsupported columns / allowlisted in validate-migrations.mjs):
-- - problem_embeddings.embedding (pgvector) + its HNSW index
-- - problems.searchVector (GENERATED tsvector) + its GIN index
-- - trigram GIN indexes (problems title/statement, discussion title)
-- Dropping any of these would break search or RAG at runtime.
--
-- DATA SAFETY (verified on an empty dev database; re-check on staging/prod
-- with real rows before deploying — see DEPLOYMENT.md):
-- - ContestStatus drops SCHEDULED/COMPLETED: no rows may hold those values.
-- - contest_answers.answeredAt becomes NOT NULL: no NULLs allowed.
-- - rating_history columns narrow to INTEGER: values must fit int4.

-- AlterEnum: remove unused SCHEDULED/COMPLETED contest states.
BEGIN;
CREATE TYPE "ContestStatus_new" AS ENUM ('DRAFT', 'PUBLISHED', 'REGISTRATION_OPEN', 'LIVE', 'ENDED', 'CANCELLED', 'ARCHIVED');
ALTER TABLE "public"."contests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "contests" ALTER COLUMN "status" TYPE "ContestStatus_new" USING ("status"::text::"ContestStatus_new");
ALTER TYPE "ContestStatus" RENAME TO "ContestStatus_old";
ALTER TYPE "ContestStatus_new" RENAME TO "ContestStatus";
DROP TYPE "public"."ContestStatus_old";
ALTER TABLE "contests" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropIndex: superseded contest_answer indexes (replaced by the composite
-- unique + markedForReview index below).
DROP INDEX "contest_answers_contestId_userId_idx";
DROP INDEX "contest_answers_contestQuestionId_idx";
DROP INDEX "contest_answers_participantId_contestQuestionId_key";
DROP INDEX "contest_answers_participantId_idx";

-- DropIndex: renamed-table leftover.
DROP INDEX "contest_participations_contestId_idx";

-- DropIndex + CreateIndex: user_learning_progress definition change.
DROP INDEX "user_learning_progress_userId_lastViewedAt_idx";

-- AlterTable: contest_answers idempotent-answer shape.
ALTER TABLE "contest_answers" DROP COLUMN "createdAt";
ALTER TABLE "contest_answers" ALTER COLUMN "answeredAt" SET NOT NULL;
ALTER TABLE "contest_answers" ALTER COLUMN "answeredAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "contest_answers" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable: contest_participants rename + column cleanup.
-- (Constraint renames run as standalone statements: PostgreSQL does not
-- allow combining RENAME CONSTRAINT with other actions.)
ALTER TABLE "contest_participants" RENAME CONSTRAINT "contest_participations_pkey" TO "contest_participants_pkey";
ALTER TABLE "contest_participants" DROP COLUMN "joinedAt";
ALTER TABLE "contest_participants" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable: updatedAt default alignment (@updatedAt has no DB default).
ALTER TABLE "contest_ratings" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "contest_results" ALTER COLUMN "finalizedAt" DROP DEFAULT;
ALTER TABLE "contest_results" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "reward_rules" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "rewards" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "submissions" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "user_activity_daily" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "user_points" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "problem_embeddings" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable: server-owned defaults (clients never set these).
ALTER TABLE "contests" ALTER COLUMN "durationSeconds" DROP DEFAULT;
ALTER TABLE "events" ALTER COLUMN "startAt" DROP DEFAULT;
ALTER TABLE "events" ALTER COLUMN "endAt" DROP DEFAULT;

-- AlterTable: event_participants joinedAt becomes nullable.
ALTER TABLE "event_participants" RENAME CONSTRAINT "event_participations_pkey" TO "event_participants_pkey";
ALTER TABLE "event_participants" ALTER COLUMN "joinedAt" DROP NOT NULL;
ALTER TABLE "event_participants" ALTER COLUMN "joinedAt" DROP DEFAULT;

-- AlterTable: rating_history integer narrowing.
ALTER TABLE "rating_history" ALTER COLUMN "ratingBefore" SET DATA TYPE INTEGER;
ALTER TABLE "rating_history" ALTER COLUMN "ratingAfter" SET DATA TYPE INTEGER;
ALTER TABLE "rating_history" ALTER COLUMN "delta" SET DATA TYPE INTEGER;

-- CreateIndex: idempotent answer upsert + review filter.
CREATE INDEX "contest_answers_participantId_markedForReview_idx" ON "contest_answers"("participantId", "markedForReview");
CREATE UNIQUE INDEX "contest_answers_contestQuestionId_participantId_key" ON "contest_answers"("contestQuestionId", "participantId");

-- CreateIndex: user_learning_progress definition change (see drop above).
CREATE INDEX "user_learning_progress_userId_lastViewedAt_idx" ON "user_learning_progress"("userId", "lastViewedAt");

-- RenameForeignKey: contest_participations_* -> contest_participants_*.
ALTER TABLE "contest_participants" RENAME CONSTRAINT "contest_participations_contestId_fkey" TO "contest_participants_contestId_fkey";
ALTER TABLE "contest_participants" RENAME CONSTRAINT "contest_participations_userId_fkey" TO "contest_participants_userId_fkey";

-- RenameIndex: table-rename and column-rename follow-ups.
ALTER INDEX "contest_participations_contestId_userId_key" RENAME TO "contest_participants_contestId_userId_key";
ALTER INDEX "contest_participations_userId_idx" RENAME TO "contest_participants_userId_idx";
ALTER INDEX "contest_results_contestId_score_completion_idx" RENAME TO "contest_results_contestId_score_completionSeconds_idx";
ALTER INDEX "event_results_eventId_score_idx" RENAME TO "event_results_eventId_score_completionSeconds_idx";
