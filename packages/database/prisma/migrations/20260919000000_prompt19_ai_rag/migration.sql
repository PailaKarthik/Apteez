-- Prompt 19: AI application layer + RAG pgvector foundation.
-- Adds the embedding metadata table (vector column via raw SQL, since Prisma
-- has no native `vector` scalar) and the append-only AI usage log. The
-- pgvector extension install is best-effort: without it the vector column
-- and index are skipped and retrieval falls back to lexical search.

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "vector";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "problem_embeddings" (
  "problemId" UUID NOT NULL,
  "model" TEXT NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "generatedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "problem_embeddings_pkey" PRIMARY KEY ("problemId")
);
DO $$ BEGIN
  ALTER TABLE "problem_embeddings" ADD CONSTRAINT "problem_embeddings_problemId_fkey"
    FOREIGN KEY ("problemId") REFERENCES "problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- The vector column is intentionally absent from the Prisma model (opaque to
-- the ORM); the embedding pipeline is its sole writer via parameterized SQL.
DO $$ BEGIN
  ALTER TABLE "problem_embeddings" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS "problem_embeddings_status_idx" ON "problem_embeddings"("status");
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "problem_embeddings_embedding_idx"
    ON "problem_embeddings" USING hnsw ("embedding" vector_cosine_ops);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ai_usage_logs" (
  "id" UUID NOT NULL,
  "feature" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "userId" UUID,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "latencyMs" INTEGER,
  "success" BOOLEAN NOT NULL,
  "error" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ai_usage_logs_feature_createdAt_idx" ON "ai_usage_logs"("feature", "createdAt");
CREATE INDEX IF NOT EXISTS "ai_usage_logs_userId_createdAt_idx" ON "ai_usage_logs"("userId", "createdAt");
