-- Attempt lifecycle for practice (and, later, challenge/contest) submissions.
CREATE TYPE "AttemptStatus" AS ENUM ('STARTED', 'SUBMITTED', 'ABANDONED', 'EXPIRED');

-- Evolve submissions into a start→submit lifecycle. New columns land with
-- safe defaults so existing rows can be backfilled in place.
ALTER TABLE "submissions"
  ADD COLUMN "status" "AttemptStatus" NOT NULL DEFAULT 'STARTED',
  ADD COLUMN "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "clientTimeSpentSeconds" INTEGER,
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "isCorrect" DROP NOT NULL,
  ALTER COLUMN "submittedAt" DROP DEFAULT,
  ALTER COLUMN "submittedAt" DROP NOT NULL;

-- Backfill: every pre-existing row was a finalized attempt (submittedAt was
-- NOT NULL with a default). Reconstruct the start clock from the recorded
-- duration where available.
UPDATE "submissions"
SET "status" = 'SUBMITTED',
    "startedAt" = "submittedAt" - make_interval(secs => COALESCE("timeSpentSeconds", 0)),
    "createdAt" = "submittedAt",
    "updatedAt" = "submittedAt"
WHERE "submittedAt" IS NOT NULL;

CREATE INDEX "submissions_problemId_submittedAt_idx" ON "submissions"("problemId", "submittedAt");
CREATE INDEX "submissions_context_status_idx" ON "submissions"("context", "status");