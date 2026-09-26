-- Timed challenge matches: solo runs against the house bot, endless
-- questions until the clock expires.
-- 1. challenges.isSolo marks unrated solo runs.
ALTER TABLE "challenges" ADD COLUMN "isSolo" BOOLEAN NOT NULL DEFAULT false;

-- 2. users.isSystem marks system accounts (house bot): never sign in,
-- never appear on leaderboards.
ALTER TABLE "users" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

-- 3. Endless questions need repeats when a domain pool is small: drop the
-- per-challenge problem uniqueness (position uniqueness stays, so ordering
-- can never collide). Constraint name is resolved dynamically so the
-- migration is robust to Prisma's naming.
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT c.conname INTO cname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_attribute a1 ON a1.attrelid = t.oid AND a1.attnum = (c.conkey)[1]
  JOIN pg_attribute a2 ON a2.attrelid = t.oid AND a2.attnum = (c.conkey)[2]
  WHERE t.relname = 'challenge_questions'
    AND c.contype = 'u'
    AND a1.attname = 'challengeId'
    AND a2.attname = 'problemId';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE "challenge_questions" DROP CONSTRAINT %I', cname);
  END IF;
END $$;
