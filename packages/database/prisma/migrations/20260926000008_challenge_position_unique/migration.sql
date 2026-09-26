-- Restores the (challengeId, position) uniqueness that 00007 unintentionally
-- dropped alongside the (challengeId, problemId) uniqueness. Position
-- uniqueness is load-bearing: endless top-ups append by position, and the
-- Prisma schema still declares @@unique([challengeId, position]).
-- The (challengeId, problemId) uniqueness stays dropped on purpose so small
-- pools can recycle questions in long timed matches.
CREATE UNIQUE INDEX IF NOT EXISTS "challenge_questions_challengeId_position_key"
  ON "challenge_questions"("challengeId", "position");
