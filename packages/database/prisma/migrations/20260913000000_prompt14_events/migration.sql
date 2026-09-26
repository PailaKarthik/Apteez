-- Prompt 14: full Events platform (lifecycle, registration, participation, results, invites, orgs, notifications).
-- Extends the minimal Event/EventParticipation boundary into a production module.

-- 1. Lifecycle enum: add new states (existing: DRAFT, PUBLISHED, CANCELLED, COMPLETED).
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'REGISTRATION_OPEN';
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'REGISTRATION_CLOSED';
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'LIVE';
ALTER TYPE "EventStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- 2. New enums.
DO $$ BEGIN
  CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'UNIVERSITY', 'COMMUNITY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "EventType" AS ENUM ('CONTEST', 'QUIZ', 'WORKSHOP', 'MARATHON', 'MEETUP', 'AMA', 'HACKATHON');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "EventParticipantStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'ACTIVE', 'SUBMITTED', 'AUTO_SUBMITTED', 'WITHDRAWN', 'DISQUALIFIED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "EventInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "NotificationType" AS ENUM ('EVENT_REGISTERED', 'EVENT_WITHDRAWN', 'EVENT_STARTING_SOON', 'EVENT_STARTED', 'EVENT_CANCELLED', 'EVENT_UPDATED', 'EVENT_RESULTS_PUBLISHED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Organizations.
CREATE TABLE IF NOT EXISTS "organizations" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "ownerId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organizations_slug_key" ON "organizations"("slug");
CREATE INDEX IF NOT EXISTS "organizations_slug_idx" ON "organizations"("slug");
DO $$ BEGIN
  ALTER TABLE "organizations" ADD CONSTRAINT "organizations_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "organization_members" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "organization_members_organizationId_userId_key" ON "organization_members"("organizationId", "userId");
CREATE INDEX IF NOT EXISTS "organization_members_organizationId_idx" ON "organization_members"("organizationId");
CREATE INDEX IF NOT EXISTS "organization_members_userId_idx" ON "organization_members"("userId");
DO $$ BEGIN
  ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Extend events table to the full spec.
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "organizationId" UUID,
  ADD COLUMN IF NOT EXISTS "eventType" "EventType" NOT NULL DEFAULT 'CONTEST',
  ADD COLUMN IF NOT EXISTS "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN IF NOT EXISTS "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS "bannerKey" TEXT,
  ADD COLUMN IF NOT EXISTS "maxParticipants" INTEGER,
  ADD COLUMN IF NOT EXISTS "registrationStartAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "registrationEndAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "startAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "endAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "isPaid" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "price" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "paymentProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "orderReference" TEXT,
  ADD COLUMN IF NOT EXISTS "refundStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "rules" TEXT,
  ADD COLUMN IF NOT EXISTS "questionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "participantCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMPTZ(3);
-- Backfill description NOT NULL (old column was nullable).
UPDATE "events" SET "description" = '' WHERE "description" IS NULL;
DO $$ BEGIN
  ALTER TABLE "events" ALTER COLUMN "description" SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "events" ADD CONSTRAINT "events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- Drop legacy location column if present (replaced by eventType/visibility model).
DO $$ BEGIN
  ALTER TABLE "events" DROP COLUMN IF EXISTS "location";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
-- Migrate legacy startsAt/endsAt (nullable endsAt) if they exist under old names.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='events' AND column_name='startsAt') THEN
    UPDATE "events" SET "startAt" = "startsAt" WHERE "startAt" IS NULL OR "startAt" = CURRENT_TIMESTAMP;
    UPDATE "events" SET "endAt" = COALESCE("endsAt", "startsAt" + INTERVAL '2 hours') WHERE "endAt" IS NULL OR "endAt" = CURRENT_TIMESTAMP;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "events" DROP COLUMN IF EXISTS "startsAt";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "events" DROP COLUMN IF EXISTS "endsAt";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "events_status_idx" ON "events"("status");
CREATE INDEX IF NOT EXISTS "events_visibility_idx" ON "events"("visibility");
CREATE INDEX IF NOT EXISTS "events_organizerId_idx" ON "events"("organizerId");
CREATE INDEX IF NOT EXISTS "events_organizationId_idx" ON "events"("organizationId");
CREATE INDEX IF NOT EXISTS "events_startAt_idx" ON "events"("startAt");
CREATE INDEX IF NOT EXISTS "events_status_startAt_idx" ON "events"("status", "startAt");
CREATE INDEX IF NOT EXISTS "events_status_visibility_startAt_idx" ON "events"("status", "visibility", "startAt");
CREATE INDEX IF NOT EXISTS "events_slug_idx" ON "events"("slug");
CREATE INDEX IF NOT EXISTS "events_eventType_status_idx" ON "events"("eventType", "status");
CREATE INDEX IF NOT EXISTS "events_difficulty_idx" ON "events"("difficulty");

-- 5. Rebuild event_participations into event_participants with lifecycle columns.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='event_participations') THEN
    ALTER TABLE "event_participations" RENAME TO "event_participants";
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
-- A renamed legacy table lacks the lifecycle columns the indexes below need.
ALTER TABLE "event_participants"
  ADD COLUMN IF NOT EXISTS "status" "EventParticipantStatus" NOT NULL DEFAULT 'REGISTERED',
  ADD COLUMN IF NOT EXISTS "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "effectiveEndAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "currentPosition" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "score" INTEGER,
  ADD COLUMN IF NOT EXISTS "rank" INTEGER;
CREATE TABLE IF NOT EXISTS "event_participants" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" "EventParticipantStatus" NOT NULL DEFAULT 'REGISTERED',
  "registeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "joinedAt" TIMESTAMPTZ(3),
  "effectiveEndAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "submittedAt" TIMESTAMPTZ(3),
  "lastSeenAt" TIMESTAMPTZ(3),
  "currentPosition" INTEGER NOT NULL DEFAULT 0,
  "score" INTEGER,
  "rank" INTEGER,
  CONSTRAINT "event_participants_pkey" PRIMARY KEY ("id")
);
-- Backfill joinedAt -> registeredAt for legacy rows.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_participants' AND column_name='joinedAt')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='event_participants' AND column_name='registeredAt') THEN
    UPDATE "event_participants" SET "registeredAt" = COALESCE("registeredAt", "joinedAt", CURRENT_TIMESTAMP);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "event_participants_eventId_userId_key" ON "event_participants"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "event_participants_eventId_idx" ON "event_participants"("eventId");
CREATE INDEX IF NOT EXISTS "event_participants_userId_idx" ON "event_participants"("userId");
CREATE INDEX IF NOT EXISTS "event_participants_eventId_status_idx" ON "event_participants"("eventId", "status");
DO $$ BEGIN
  ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Event questions (canonical problem references).
CREATE TABLE IF NOT EXISTS "event_questions" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "problemId" UUID NOT NULL,
  "order" INTEGER NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 1,
  "timeLimitSeconds" INTEGER,
  CONSTRAINT "event_questions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "event_questions_eventId_order_key" ON "event_questions"("eventId", "order");
CREATE UNIQUE INDEX IF NOT EXISTS "event_questions_eventId_problemId_key" ON "event_questions"("eventId", "problemId");
CREATE INDEX IF NOT EXISTS "event_questions_eventId_idx" ON "event_questions"("eventId");
DO $$ BEGIN
  ALTER TABLE "event_questions" ADD CONSTRAINT "event_questions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_questions" ADD CONSTRAINT "event_questions_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Event answers.
CREATE TABLE IF NOT EXISTS "event_answers" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "participantId" UUID NOT NULL,
  "eventQuestionId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "selectedOptionId" UUID,
  "isCorrect" BOOLEAN,
  "markedForReview" BOOLEAN NOT NULL DEFAULT false,
  "answeredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_answers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "event_answers_eventQuestionId_participantId_key" ON "event_answers"("eventQuestionId", "participantId");
CREATE INDEX IF NOT EXISTS "event_answers_eventId_participantId_idx" ON "event_answers"("eventId", "participantId");
CREATE INDEX IF NOT EXISTS "event_answers_participantId_idx" ON "event_answers"("participantId");
DO $$ BEGIN
  ALTER TABLE "event_answers" ADD CONSTRAINT "event_answers_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_answers" ADD CONSTRAINT "event_answers_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_answers" ADD CONSTRAINT "event_answers_eventQuestionId_fkey" FOREIGN KEY ("eventQuestionId") REFERENCES "event_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_answers" ADD CONSTRAINT "event_answers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. Event results (immutable, persisted ranking).
CREATE TABLE IF NOT EXISTS "event_results" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "participantId" UUID NOT NULL,
  "score" INTEGER NOT NULL,
  "correctCount" INTEGER NOT NULL,
  "wrongCount" INTEGER NOT NULL,
  "unansweredCount" INTEGER NOT NULL,
  "totalPoints" INTEGER NOT NULL,
  "completionSeconds" INTEGER NOT NULL,
  "rank" INTEGER,
  "autoSubmitted" BOOLEAN NOT NULL DEFAULT false,
  "finalizedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_results_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "event_results_participantId_key" ON "event_results"("participantId");
CREATE UNIQUE INDEX IF NOT EXISTS "event_results_eventId_userId_key" ON "event_results"("eventId", "userId");
CREATE INDEX IF NOT EXISTS "event_results_eventId_rank_idx" ON "event_results"("eventId", "rank");
CREATE INDEX IF NOT EXISTS "event_results_eventId_score_idx" ON "event_results"("eventId", "score" DESC, "completionSeconds");
DO $$ BEGIN
  ALTER TABLE "event_results" ADD CONSTRAINT "event_results_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_results" ADD CONSTRAINT "event_results_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_results" ADD CONSTRAINT "event_results_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "event_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 9. Event invites.
CREATE TABLE IF NOT EXISTS "event_invites" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "invitedUserId" UUID,
  "invitedEmail" TEXT,
  "invitedById" UUID NOT NULL,
  "status" "EventInviteStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "respondedAt" TIMESTAMPTZ(3),
  CONSTRAINT "event_invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "event_invites_eventId_invitedUserId_key" ON "event_invites"("eventId", "invitedUserId");
CREATE INDEX IF NOT EXISTS "event_invites_eventId_status_idx" ON "event_invites"("eventId", "status");
CREATE INDEX IF NOT EXISTS "event_invites_invitedUserId_idx" ON "event_invites"("invitedUserId");
DO $$ BEGIN
  ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_invites" ADD CONSTRAINT "event_invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 10. Event audits.
CREATE TABLE IF NOT EXISTS "event_audits" (
  "id" UUID NOT NULL,
  "eventId" UUID NOT NULL,
  "actorId" UUID,
  "action" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_audits_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "event_audits_eventId_createdAt_idx" ON "event_audits"("eventId", "createdAt");
CREATE INDEX IF NOT EXISTS "event_audits_actorId_idx" ON "event_audits"("actorId");
DO $$ BEGIN
  ALTER TABLE "event_audits" ADD CONSTRAINT "event_audits_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "event_audits" ADD CONSTRAINT "event_audits_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 11. Notifications inbox.
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT,
  "eventId" UUID,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_createdAt_idx" ON "notifications"("userId", "isRead", "createdAt");
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "notifications" ADD CONSTRAINT "notifications_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
