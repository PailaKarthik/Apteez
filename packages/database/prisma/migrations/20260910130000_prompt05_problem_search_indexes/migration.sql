-- Trigram search support for the problem library. Prisma cannot express GIN
-- indexes, so they are authored here; the extension is also declared on the
-- datasource so future diffs stay in sync.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Case-insensitive substring search on title and statement (ILIKE '%term%')
CREATE INDEX IF NOT EXISTS "problems_title_trgm_idx"
  ON "problems" USING gin ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "problems_statement_trgm_idx"
  ON "problems" USING gin ("statement" gin_trgm_ops);

-- Covering-ish support for the most common keyset sorts.
CREATE INDEX IF NOT EXISTS "problems_createdAt_id_idx"
  ON "problems" ("createdAt" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "problems_rating_id_idx"
  ON "problems" ("rating" DESC, "id" DESC);