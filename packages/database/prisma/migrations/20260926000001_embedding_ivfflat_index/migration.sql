-- IVFFLAT cosine index for RAG vector retrieval.
--
-- HNSW was evaluated first and rejected: this Neon's storage layer aborts
-- unlogged HNSW builds ([NEON_SMGR] unlogged index build was not properly
-- finished), even solo in a single-statement transaction. IVFFLAT is a
-- logged index type and builds cleanly here. lists=100 suits the current
-- small corpus (results are exact at this scale); raise toward rows/1000 as
-- the library grows. Retrieval never depends on the index existing (exact
-- scan fallback), and vectors-absent serves lexical fallback.
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "problem_embeddings_embedding_idx"
    ON "problem_embeddings" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
