-- Endless timed matches recycle questions when a domain pool is small, so a
-- challenge must be allowed to contain the same problem twice (at different
-- positions). Drops ONLY the (challengeId, problemId) unique index.
-- The (challengeId, position) uniqueness stays: order can never collide.
DROP INDEX IF EXISTS "challenge_questions_challengeId_problemId_key";
