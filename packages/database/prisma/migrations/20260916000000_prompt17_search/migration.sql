-- Prompt 17: Search + Discovery + Personalization foundation.
-- Adds the SearchEvent analytics log and a generated full-text vector on
-- problems (GIN-indexed) for deterministic lexical ranking. Existing trigram
-- indexes stay untouched. No vector extension: the future RAG pipeline will
-- add its own embeddings table + pgvector without touching this layer.

-- 1. Full-text search vector on problems (title + statement, english).
ALTER TABLE "problems"
  ADD COLUMN IF NOT EXISTS "searchVector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("title", '') || ' ' || coalesce("statement", ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS "problems_search_vector_idx" ON "problems" USING GIN ("searchVector");

-- 2. Search analytics log.
CREATE TABLE IF NOT EXISTS "search_events" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "sessionKey" TEXT,
  "event" TEXT NOT NULL,
  "query" TEXT NOT NULL,
  "resultType" TEXT,
  "resultId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "search_events_userId_createdAt_idx" ON "search_events"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "search_events_createdAt_idx" ON "search_events"("createdAt");
DO $$ BEGIN
  ALTER TABLE "search_events" ADD CONSTRAINT "search_events_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Discussion title/body trigram support for fast prefix/partial matching.
CREATE INDEX IF NOT EXISTS "discussion_posts_title_trgm_idx" ON "discussion_posts" USING gin ("title" gin_trgm_ops);
