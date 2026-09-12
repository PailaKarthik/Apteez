-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProblemContentMode" AS ENUM ('TEXT_ONLY', 'IMAGE_ONLY', 'TEXT_AND_IMAGE');

-- CreateEnum
CREATE TYPE "ProblemAssetKind" AS ENUM ('QUESTION_IMAGE', 'EXPLANATION_IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "SubmissionContext" AS ENUM ('PRACTICE', 'CHALLENGE', 'CONTEST');

-- CreateEnum
CREATE TYPE "RatingScope" AS ENUM ('CHALLENGE', 'CONTEST');

-- CreateEnum
CREATE TYPE "PointTransactionType" AS ENUM ('EARN', 'SPEND', 'ADJUST');

-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED');

-- AlterTable
ALTER TABLE "permissions" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "roles" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "user_roles" ALTER COLUMN "assignedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" DROP COLUMN "avatarUrl",
ADD COLUMN     "avatarKey" TEXT,
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "institution" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "username" TEXT,
ALTER COLUMN "emailVerified" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subtopics" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subtopics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problems" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT,
    "contentMode" "ProblemContentMode" NOT NULL DEFAULT 'TEXT_ONLY',
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "status" "ProblemStatus" NOT NULL DEFAULT 'DRAFT',
    "explanation" TEXT,
    "shortcut" TEXT,
    "source" TEXT,
    "sourceYear" INTEGER,
    "creatorId" UUID,
    "categoryId" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "subtopicId" UUID,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_assets" (
    "id" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "kind" "ProblemAssetKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "altText" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_options" (
    "id" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT,
    "assetKey" TEXT,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "problem_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" UUID NOT NULL,
    "contributorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "explanation" TEXT,
    "difficulty" "Difficulty",
    "topicId" UUID,
    "sourceUrl" TEXT,
    "status" "ContributionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" UUID,
    "reviewerNote" TEXT,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(3),
    "resultingProblemId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "exam_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "problem_exams" (
    "problemId" UUID NOT NULL,
    "examTagId" UUID NOT NULL,

    CONSTRAINT "problem_exams_pkey" PRIMARY KEY ("problemId","examTagId")
);

-- CreateTable
CREATE TABLE "favorite_collections" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "defaultSlot" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "favorite_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorite_collection_items" (
    "id" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorite_collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "selectedOptionId" UUID,
    "isCorrect" BOOLEAN NOT NULL,
    "timeSpentSeconds" INTEGER,
    "context" "SubmissionContext" NOT NULL DEFAULT 'PRACTICE',
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_ratings" (
    "userId" UUID NOT NULL,
    "scope" "RatingScope" NOT NULL,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 1500,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_ratings_pkey" PRIMARY KEY ("userId","scope")
);

-- CreateTable
CREATE TABLE "rating_history" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "scope" "RatingScope" NOT NULL,
    "ratingBefore" DOUBLE PRECISION NOT NULL,
    "ratingAfter" DOUBLE PRECISION NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rating_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_transactions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "type" "PointTransactionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "points" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_achievements" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "achievementId" UUID NOT NULL,
    "unlockedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_streaks" (
    "userId" UUID NOT NULL,
    "currentCount" INTEGER NOT NULL DEFAULT 0,
    "longestCount" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDate" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_streaks_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "contests" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "ContestStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "maxParticipants" INTEGER,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "contests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_participations" (
    "id" UUID NOT NULL,
    "contestId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rank" INTEGER,
    "score" DOUBLE PRECISION,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contest_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3),
    "location" TEXT,
    "organizerId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_participations" (
    "id" UUID NOT NULL,
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_posts" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "discussion_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussion_replies" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "discussion_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "topics_categoryId_idx" ON "topics"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "topics_categoryId_slug_key" ON "topics"("categoryId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "topics_categoryId_name_key" ON "topics"("categoryId", "name");

-- CreateIndex
CREATE INDEX "subtopics_topicId_idx" ON "subtopics"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "subtopics_topicId_slug_key" ON "subtopics"("topicId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "subtopics_topicId_name_key" ON "subtopics"("topicId", "name");

-- CreateIndex
CREATE INDEX "problems_status_idx" ON "problems"("status");

-- CreateIndex
CREATE INDEX "problems_categoryId_status_idx" ON "problems"("categoryId", "status");

-- CreateIndex
CREATE INDEX "problems_topicId_status_idx" ON "problems"("topicId", "status");

-- CreateIndex
CREATE INDEX "problems_difficulty_idx" ON "problems"("difficulty");

-- CreateIndex
CREATE INDEX "problems_rating_idx" ON "problems"("rating");

-- CreateIndex
CREATE INDEX "problems_createdAt_idx" ON "problems"("createdAt");

-- CreateIndex
CREATE INDEX "problems_creatorId_idx" ON "problems"("creatorId");

-- CreateIndex
CREATE INDEX "problem_assets_problemId_position_idx" ON "problem_assets"("problemId", "position");

-- CreateIndex
CREATE INDEX "problem_options_problemId_idx" ON "problem_options"("problemId");

-- CreateIndex
CREATE UNIQUE INDEX "problem_options_problemId_position_key" ON "problem_options"("problemId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_resultingProblemId_key" ON "contributions"("resultingProblemId");

-- CreateIndex
CREATE INDEX "contributions_contributorId_idx" ON "contributions"("contributorId");

-- CreateIndex
CREATE INDEX "contributions_status_idx" ON "contributions"("status");

-- CreateIndex
CREATE INDEX "contributions_submittedAt_idx" ON "contributions"("submittedAt");

-- CreateIndex
CREATE INDEX "contributions_reviewerId_idx" ON "contributions"("reviewerId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_tags_name_key" ON "exam_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "exam_tags_slug_key" ON "exam_tags"("slug");

-- CreateIndex
CREATE INDEX "problem_exams_examTagId_idx" ON "problem_exams"("examTagId");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_collections_defaultSlot_key" ON "favorite_collections"("defaultSlot");

-- CreateIndex
CREATE INDEX "favorite_collections_ownerId_idx" ON "favorite_collections"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_collections_ownerId_name_key" ON "favorite_collections"("ownerId", "name");

-- CreateIndex
CREATE INDEX "favorite_collection_items_collectionId_addedAt_idx" ON "favorite_collection_items"("collectionId", "addedAt");

-- CreateIndex
CREATE INDEX "favorite_collection_items_problemId_idx" ON "favorite_collection_items"("problemId");

-- CreateIndex
CREATE UNIQUE INDEX "favorite_collection_items_collectionId_problemId_key" ON "favorite_collection_items"("collectionId", "problemId");

-- CreateIndex
CREATE INDEX "submissions_userId_submittedAt_idx" ON "submissions"("userId", "submittedAt");

-- CreateIndex
CREATE INDEX "submissions_problemId_idx" ON "submissions"("problemId");

-- CreateIndex
CREATE INDEX "submissions_userId_problemId_idx" ON "submissions"("userId", "problemId");

-- CreateIndex
CREATE INDEX "submissions_userId_context_submittedAt_idx" ON "submissions"("userId", "context", "submittedAt");

-- CreateIndex
CREATE INDEX "user_ratings_scope_rating_idx" ON "user_ratings"("scope", "rating");

-- CreateIndex
CREATE INDEX "rating_history_userId_scope_createdAt_idx" ON "rating_history"("userId", "scope", "createdAt");

-- CreateIndex
CREATE INDEX "point_transactions_userId_createdAt_idx" ON "point_transactions"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "achievements_key_key" ON "achievements"("key");

-- CreateIndex
CREATE INDEX "user_achievements_userId_idx" ON "user_achievements"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_achievements_userId_achievementId_key" ON "user_achievements"("userId", "achievementId");

-- CreateIndex
CREATE UNIQUE INDEX "contests_slug_key" ON "contests"("slug");

-- CreateIndex
CREATE INDEX "contests_status_startsAt_idx" ON "contests"("status", "startsAt");

-- CreateIndex
CREATE INDEX "contest_participations_contestId_idx" ON "contest_participations"("contestId");

-- CreateIndex
CREATE INDEX "contest_participations_userId_idx" ON "contest_participations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "contest_participations_contestId_userId_key" ON "contest_participations"("contestId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "events_status_startsAt_idx" ON "events"("status", "startsAt");

-- CreateIndex
CREATE INDEX "event_participations_eventId_idx" ON "event_participations"("eventId");

-- CreateIndex
CREATE INDEX "event_participations_userId_idx" ON "event_participations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "event_participations_eventId_userId_key" ON "event_participations"("eventId", "userId");

-- CreateIndex
CREATE INDEX "discussion_posts_createdAt_idx" ON "discussion_posts"("createdAt");

-- CreateIndex
CREATE INDEX "discussion_posts_authorId_idx" ON "discussion_posts"("authorId");

-- CreateIndex
CREATE INDEX "discussion_replies_postId_createdAt_idx" ON "discussion_replies"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE INDEX "user_roles_roleId_idx" ON "user_roles"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subtopics" ADD CONSTRAINT "subtopics_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problems" ADD CONSTRAINT "problems_subtopicId_fkey" FOREIGN KEY ("subtopicId") REFERENCES "subtopics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_assets" ADD CONSTRAINT "problem_assets_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_options" ADD CONSTRAINT "problem_options_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_contributorId_fkey" FOREIGN KEY ("contributorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_resultingProblemId_fkey" FOREIGN KEY ("resultingProblemId") REFERENCES "problems"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_exams" ADD CONSTRAINT "problem_exams_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "problem_exams" ADD CONSTRAINT "problem_exams_examTagId_fkey" FOREIGN KEY ("examTagId") REFERENCES "exam_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_collections" ADD CONSTRAINT "favorite_collections_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_collection_items" ADD CONSTRAINT "favorite_collection_items_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "favorite_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorite_collection_items" ADD CONSTRAINT "favorite_collection_items_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_selectedOptionId_fkey" FOREIGN KEY ("selectedOptionId") REFERENCES "problem_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_ratings" ADD CONSTRAINT "user_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_userId_scope_fkey" FOREIGN KEY ("userId", "scope") REFERENCES "user_ratings"("userId", "scope") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_transactions" ADD CONSTRAINT "point_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "achievements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_streaks" ADD CONSTRAINT "user_streaks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contests" ADD CONSTRAINT "contests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_participations" ADD CONSTRAINT "contest_participations_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_participations" ADD CONSTRAINT "contest_participations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participations" ADD CONSTRAINT "event_participations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participations" ADD CONSTRAINT "event_participations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_posts" ADD CONSTRAINT "discussion_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_postId_fkey" FOREIGN KEY ("postId") REFERENCES "discussion_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discussion_replies" ADD CONSTRAINT "discussion_replies_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
