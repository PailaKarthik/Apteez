-- Prompt 13: community discussions (reactions, reports, tags, accepted solutions).

-- CreateEnum
CREATE TYPE "DiscussionReactionType" AS ENUM ('UPVOTE', 'DOWNVOTE');

-- CreateEnum
CREATE TYPE "DiscussionReportReason" AS ENUM ('SPAM', 'ABUSE', 'OFF_TOPIC', 'INAPPROPRIATE', 'OTHER');

-- CreateEnum
CREATE TYPE "DiscussionReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

-- AlterTable: discussion_posts
ALTER TABLE "discussion_posts"
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "problemId" UUID,
  ADD COLUMN "isResolved" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reactionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "replyCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastActivityAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "discussion_posts" SET "lastActivityAt" = "createdAt";
UPDATE "discussion_posts" p
SET "replyCount" = (
  SELECT COUNT(*) FROM "discussion_replies" r
  WHERE r."postId" = p."id" AND r."deletedAt" IS NULL
);

DROP INDEX "discussion_posts_createdAt_idx";
CREATE INDEX "discussion_posts_lastActivityAt_idx" ON "discussion_posts"("lastActivityAt");
CREATE INDEX "discussion_posts_isPinned_lastActivityAt_idx" ON "discussion_posts"("isPinned", "lastActivityAt");
CREATE INDEX "discussion_posts_problemId_idx" ON "discussion_posts"("problemId");
CREATE INDEX "discussion_posts_tags_idx" ON "discussion_posts" USING GIN ("tags");

-- AlterTable: discussion_replies
ALTER TABLE "discussion_replies"
  ADD COLUMN "isAcceptedSolution" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reactionCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "discussion_replies_postId_isAcceptedSolution_idx" ON "discussion_replies"("postId", "isAcceptedSolution");

-- CreateTable: discussion_reactions
CREATE TABLE "discussion_reactions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "postId" UUID,
    "replyId" UUID,
    "type" "DiscussionReactionType" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discussion_reactions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discussion_reactions_userId_postId_key" ON "discussion_reactions"("userId", "postId");
CREATE UNIQUE INDEX "discussion_reactions_userId_replyId_key" ON "discussion_reactions"("userId", "replyId");
CREATE INDEX "discussion_reactions_postId_idx" ON "discussion_reactions"("postId");
CREATE INDEX "discussion_reactions_replyId_idx" ON "discussion_reactions"("replyId");

ALTER TABLE "discussion_reactions"
  ADD CONSTRAINT "discussion_reactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "discussion_reactions_postId_fkey" FOREIGN KEY ("postId") REFERENCES "discussion_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "discussion_reactions_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "discussion_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: discussion_reports
CREATE TABLE "discussion_reports" (
    "id" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "postId" UUID,
    "replyId" UUID,
    "reason" "DiscussionReportReason" NOT NULL,
    "detail" TEXT,
    "status" "DiscussionReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "discussion_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "discussion_reports_status_createdAt_idx" ON "discussion_reports"("status", "createdAt");
CREATE INDEX "discussion_reports_postId_idx" ON "discussion_reports"("postId");
CREATE INDEX "discussion_reports_replyId_idx" ON "discussion_reports"("replyId");

ALTER TABLE "discussion_reports"
  ADD CONSTRAINT "discussion_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "discussion_reports_postId_fkey" FOREIGN KEY ("postId") REFERENCES "discussion_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "discussion_reports_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "discussion_replies"("id") ON DELETE CASCADE ON UPDATE CASCADE;