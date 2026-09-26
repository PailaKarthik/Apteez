-- Question difficulty ratings: whole hundreds within 1000-2000 only
-- (1000, 1100, ..., 2000). Re-normalizes any rows written through the legacy
-- 0-4000 free-form path, then enforces the band at the database level so
-- future writes cannot drift. Player Elo ratings (challenge/contest) are
-- intentionally untouched — only question difficulty follows this rule.
UPDATE "problems"
SET "rating" = GREATEST(1000, LEAST(2000, ROUND("rating" / 100) * 100))
WHERE "rating" < 1000 OR "rating" > 2000 OR MOD(CAST(ROUND("rating") AS INTEGER), 100) <> 0;

-- Enforce the band for all future writes (dropped + recreated idempotently).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'problems_rating_hundreds_chk'
  ) THEN
    ALTER TABLE "problems" DROP CONSTRAINT "problems_rating_hundreds_chk";
  END IF;
  ALTER TABLE "problems"
    ADD CONSTRAINT "problems_rating_hundreds_chk"
    CHECK ("rating" >= 1000 AND "rating" <= 2000);
END $$;
