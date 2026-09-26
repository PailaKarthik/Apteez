# RAG rollout (Similar Problems)

## Pre-enable checklist (staging first, then production)

1. Embedding provider keys configured (`EMBEDDING_API_KEY`, model/dims match
   the active triple — retrieval filters `(model, dimensions, version)`
   exactly, so a mismatch silently yields zero vector rows).
2. `GET /admin/ai/embeddings/backfill?dryRun=true` → review
   `missingEmbedding` / `staleNonReady` / `readyForTriple` /
   `providerConfigured`. Always preview first.
3. `POST /admin/ai/embeddings/backfill` (no dry-run) → chain progresses on
   BullMQ; failures inspectable via `/admin/queues`; pages are idempotent
   and resumable by cursor (re-triggering collapses into the running chain).
4. Retrieval tests: eval suite green (`GET /admin/ai/evaluations`);
   filtering verified (`rag.filtered-ineligible` quiet); rerank sane on
   spot-checks; fallback verified (kill the provider key on staging →
   lexical lists, zero 500s).
5. Enable `FEATURE_AI_SIMILAR_PROBLEMS` (rollout 10 → 50 → unset) and watch
   `GET /admin/ai/quality`: `vector` share climbing, `empty` near zero.

## Disabled behavior

Vector retrieval is skipped entirely; the deterministic lexical
topic/rating-band fallback serves; rows are always canonical PUBLISHED
problems — never generated. Telemetry still records (`lexical-fallback`).

## Outages

pgvector down, provider down, retrieval timeout, rerank failure → safe
fallback, user keeps solving. Publishing never waits for embeddings
(async job + retry). Basic problem access never depends on vectors.
