-- Endless timed matches recycle questions when a domain pool is small, so a
-- challenge must be allowed to contain the same problem twice (at different
-- positions). Drops ONLY the (challengeId, problemId) uniqueness by its exact
-- Prisma-generated name. The (challengeId, position) uniqueness stays: order
-- can never collide. Idempotent via IF EXISTS.
ALTER TABLE "challenge_questions"
  DROP CONSTRAINT IF EXISTS "challenge_questions_challengeId_problemId_key";
