-- Question ratings are whole hundreds within 1000–2000 (e.g. 1000, 1100,
-- …, 2000). Normalizes every existing row to the same rule the API now
-- enforces: nearest hundred, clamped to the band. Player Elo ratings
-- (challenge/contest) are intentionally untouched — only question
-- difficulty ratings follow this rule.
UPDATE "problems"
SET "rating" = GREATEST(1000, LEAST(2000, ROUND("rating" / 100) * 100));
