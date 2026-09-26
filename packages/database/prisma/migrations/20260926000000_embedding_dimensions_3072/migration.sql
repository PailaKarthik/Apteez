-- Switch the RAG embedding footprint from OpenAI text-embedding-3-small
-- (1536 dims) to Google gemini-embedding-001 (3072 dims).
--
-- Embedding rows are derived, regenerable cache — NOT source of truth.
-- Old-model vectors can never be reused: pgvector rejects dimension
-- mismatches outright, and retrieval additionally filters the exact
-- (model, dimensions, version) triple. Stale rows are therefore dropped
-- here and rebuilt by the backfill chain
-- (`POST /admin/ai/embeddings/backfill`, preview with `?dryRun=true`).
-- Lexical search serves meanwhile; nothing blocks on this table.
--
-- NOTE: this migration deliberately contains NO index operation. The vector
-- index is built by the follow-up migration
-- (20260926000001_embedding_ivfflat_index): one DDL concern per transaction.
DELETE FROM "problem_embeddings";
DROP INDEX IF EXISTS "problem_embeddings_embedding_idx";
DO $$ BEGIN
  ALTER TABLE "problem_embeddings"
    ALTER COLUMN "embedding" TYPE vector(3072) USING "embedding"::vector(3072);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
