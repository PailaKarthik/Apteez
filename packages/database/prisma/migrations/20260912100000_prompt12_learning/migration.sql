-- Prompt 12: structured learning (paths, topics, concepts, lessons) on top of
-- the existing taxonomy. Every practice link points at an existing Problem row;
-- progress is one row per (user, lesson) with a composite unique.

CREATE TYPE "LearningContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE "LearningProgressStatus" AS ENUM ('STARTED', 'COMPLETED');

CREATE TYPE "LearningAccessLevel" AS ENUM ('FREE', 'PREMIUM');

CREATE TABLE "learning_paths" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" UUID NOT NULL,
    "status" "LearningContentStatus" NOT NULL DEFAULT 'DRAFT',
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "icon" TEXT,
    "estimatedMinutes" INTEGER NOT NULL,
    "accessLevel" "LearningAccessLevel" NOT NULL DEFAULT 'FREE',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_paths_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_topics" (
    "id" UUID NOT NULL,
    "pathId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "topicId" UUID,
    "status" "LearningContentStatus" NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "lessonCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_topics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_concepts" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "LearningContentStatus" NOT NULL DEFAULT 'DRAFT',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_concepts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_lessons" (
    "id" UUID NOT NULL,
    "topicId" UUID NOT NULL,
    "conceptId" UUID,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "LearningContentStatus" NOT NULL DEFAULT 'DRAFT',
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "content" JSONB NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 5,
    "accessLevel" "LearningAccessLevel" NOT NULL DEFAULT 'FREE',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_lessons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_lesson_problems" (
    "id" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "problemId" UUID NOT NULL,
    "practiceCount" INTEGER NOT NULL DEFAULT 5,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_lesson_problems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "learning_lesson_exams" (
    "id" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "examTagId" UUID NOT NULL,

    CONSTRAINT "learning_lesson_exams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_learning_progress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "status" "LearningProgressStatus" NOT NULL DEFAULT 'STARTED',
    "lastViewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_learning_progress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "learning_paths_slug_key" ON "learning_paths"("slug");
CREATE UNIQUE INDEX "learning_paths_categoryId_key" ON "learning_paths"("categoryId");
CREATE INDEX "learning_paths_status_order_idx" ON "learning_paths"("status", "order" ASC);

CREATE UNIQUE INDEX "learning_topics_pathId_slug_key" ON "learning_topics"("pathId", "slug");
CREATE INDEX "learning_topics_pathId_order_idx" ON "learning_topics"("pathId", "order" ASC);
CREATE INDEX "learning_topics_status_idx" ON "learning_topics"("status");

CREATE UNIQUE INDEX "learning_concepts_topicId_slug_key" ON "learning_concepts"("topicId", "slug");
CREATE INDEX "learning_concepts_topicId_order_idx" ON "learning_concepts"("topicId", "order" ASC);

CREATE UNIQUE INDEX "learning_lessons_topicId_slug_key" ON "learning_lessons"("topicId", "slug");
CREATE INDEX "learning_lessons_topicId_order_idx" ON "learning_lessons"("topicId", "order" ASC);
CREATE INDEX "learning_lessons_status_idx" ON "learning_lessons"("status");

CREATE UNIQUE INDEX "learning_lesson_problems_problemId_key" ON "learning_lesson_problems"("problemId");
CREATE UNIQUE INDEX "learning_lesson_problems_lessonId_problemId_key" ON "learning_lesson_problems"("lessonId", "problemId");
CREATE INDEX "learning_lesson_problems_problemId_idx" ON "learning_lesson_problems"("problemId");

CREATE UNIQUE INDEX "learning_lesson_exams_lessonId_examTagId_key" ON "learning_lesson_exams"("lessonId", "examTagId");
CREATE INDEX "learning_lesson_exams_examTagId_idx" ON "learning_lesson_exams"("examTagId");

CREATE UNIQUE INDEX "user_learning_progress_userId_lessonId_key" ON "user_learning_progress"("userId", "lessonId");
CREATE INDEX "user_learning_progress_userId_lastViewedAt_idx" ON "user_learning_progress"("userId", "lastViewedAt" DESC);
CREATE INDEX "user_learning_progress_userId_status_idx" ON "user_learning_progress"("userId", "status");
CREATE INDEX "user_learning_progress_lessonId_idx" ON "user_learning_progress"("lessonId");

ALTER TABLE "learning_paths" ADD CONSTRAINT "learning_paths_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "learning_paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_topics" ADD CONSTRAINT "learning_topics_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_concepts" ADD CONSTRAINT "learning_concepts_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "learning_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "learning_lessons" ADD CONSTRAINT "learning_lessons_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "learning_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_lessons" ADD CONSTRAINT "learning_lessons_conceptId_fkey" FOREIGN KEY ("conceptId") REFERENCES "learning_concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "learning_lesson_problems" ADD CONSTRAINT "learning_lesson_problems_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "learning_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_lesson_problems" ADD CONSTRAINT "learning_lesson_problems_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "learning_lesson_exams" ADD CONSTRAINT "learning_lesson_exams_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "learning_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "learning_lesson_exams" ADD CONSTRAINT "learning_lesson_exams_examTagId_fkey" FOREIGN KEY ("examTagId") REFERENCES "exam_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_learning_progress" ADD CONSTRAINT "user_learning_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_learning_progress" ADD CONSTRAINT "user_learning_progress_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "learning_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
