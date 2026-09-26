-- Prompt 25 (final): integrity pass — constraint corrections, missing
-- join/filter indexes, and duplicate-invite protection.
--
-- 1. learning_lesson_problems.problemId was wrongly globally unique, which
--    forbids reusing one problem across lessons and contradicts both the
--    composite @@unique([lessonId, problemId]) and the model comment. Drop
--    the single-column unique; the composite unique stays authoritative.
DROP INDEX IF EXISTS "learning_lesson_problems_problemId_key";

-- 2. Missing foreign-key / filter indexes on read-heavy joins.
CREATE INDEX IF NOT EXISTS "problems_subtopicId_idx" ON "problems"("subtopicId");
CREATE INDEX IF NOT EXISTS "contributions_topicId_idx" ON "contributions"("topicId");
CREATE INDEX IF NOT EXISTS "notifications_eventId_idx" ON "notifications"("eventId");
CREATE INDEX IF NOT EXISTS "challenges_winnerId_idx" ON "challenges"("winnerId");
CREATE INDEX IF NOT EXISTS "contest_suspicious_events_userId_idx" ON "contest_suspicious_events"("userId");
CREATE INDEX IF NOT EXISTS "event_invites_invitedById_idx" ON "event_invites"("invitedById");
CREATE INDEX IF NOT EXISTS "reports_assignedModeratorId_idx" ON "reports"("assignedModeratorId");

-- 3. Email-only event invites were duplicable: @@unique([eventId,
--    invitedUserId]) never fires when invitedUserId is NULL. Partial unique
--    over the validated (trimmed, lowercased) email closes it. The service
--    already maps violations to 'That user is already invited.'
CREATE UNIQUE INDEX IF NOT EXISTS "event_invites_event_email_unique"
  ON "event_invites"("eventId", "invitedEmail")
  WHERE "invitedEmail" IS NOT NULL;

-- 4. contest_suspicious_events.participantId was a free string: wire the real
--    foreign key to contest_participants (always written from a validated
--    participant row). Fails loudly — not silently — if orphan rows exist.
DO $$ BEGIN
  ALTER TABLE "contest_suspicious_events"
    ADD CONSTRAINT "contest_suspicious_events_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "contest_participants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
