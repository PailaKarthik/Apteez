# ApteeZ — AI Architecture

Scope is fixed: **Performance Coach, RAG Similar Problems, Contribution
Review.** No AI Tutor (deferred by decision), no other model features. AI is
advisory everywhere it touches user content and never a single point of
failure — every feature has a deterministic fallback and the platform runs
fully with providers unconfigured.

```
NestJS
  ↓ (controllers never touch providers)
AI Application Layer (apps/api/src/modules/ai)
  ├─ LLMProvider / EmbeddingProvider (abstractions, OpenAI-compatible HTTPS)
  ├─ AiToolRegistry (8 Zod-validated tools over application services)
  ├─ coach-graph (LangGraph.js StateGraph + LangChain.js tools/model)
  ├─ StructuredOutputService (parse → Zod validate → 1 repair retry → fail safe)
  ├─ AiUsageTrackerService (per-user daily budgets + append-only AiUsageLog)
  ├─ AiEvaluationService (versioned fixtures, no LLM, no prod data)
  └─ ai-observability (feature, model, latency, tokens, validation, fallback)
```

## 1 — Performance Coach (LangGraph.js + LangChain.js, grounded)

```
User → Next.js → NestJS → PerformanceCoachService
→ LangGraph StateGraph (coach-graph.ts):
    gather (3 deterministic tools → grounding JSON ≤12KB)
    → reason (LangChain ChatOpenAI + 8 bound tools, ≤2 tool rounds)
    ⇄ tools (execute with 10s timeout each, user-scoped)
    → finalize (withStructuredOutput + explicit Zod re-validation
       → 1 repair retry → provider-agnostic text+parse fallback)
    → ground (suggested IDs ∩ tool-produced IDs)
→ response { summary, strengths, weakAreas, recommendations,
   suggestedProblems, confidence } + source (llm | deterministic)
```

- The model **cannot invent** solved counts, accuracy, ratings, weak areas,
  or progress: facts come only from tools; prose wraps them. Unknown IDs are
  dropped, invalid output retries once then falls back to the deterministic
  summary (cached 10 min in Redis, best-effort).
- Tool calling is real: the eight `AiToolRegistry` definitions become
  LangChain `tool()` objects bound to the requesting userId — the model can
  only read that user's data through Zod-validated services. No SQL, no
  repositories, no secrets, no writes, unknown tool names skipped.
- Guardrails are enforced, not promised: max 2 tool rounds (then tools
  unbind and the model answers from the transcript), 10 s per tool call,
  75 s whole-graph timeout, recursionLimit 20, temperature 0, maxRetries 1.
- Token usage comes from the model's `usage_metadata` when present and is
  recorded per call; otherwise counts stay null (never fabricated).

## 2 — Similar Problems RAG (real pipeline)

```
Canonical Problem → normalizeEmbeddingText (whitespace/HTML-normalized,
  v1 representation: title/question/domain/difficulty)
→ BullMQ embedding job → EmbeddingProvider → pgvector
  (problem_embeddings: embedding + model/dimensions/version/status)
→ cosine nearest neighbors → triple + metadata filtering
  (READY + exact model/dimensions/version + PUBLISHED;
  exclude self/unpublished/rejected/inaccessible)
→ application-layer re-filter (isEligibleCandidate, defense in depth)
→ deterministic rerank (cosine 0.6 + topic 0.2 + subtopic 0.1 +
  difficulty/rating fit)
→ top canonical problems → response (cached 1h, best-effort)
```

- Embedding lifecycle: `PENDING → PROCESSING → READY | FAILED`, async via
  `AiProcessor`, enqueued on approval/content change; failures mark rows and
  retry — publishing never blocks on the provider.
- Model changes never mix vectors: model/dimensions/version are stored per
  row and filtered on retrieval; the query row itself must match the active
  triple or the vector path is skipped. Re-embed procedure in DEPLOYMENT.md.
- Content edits mark rows stale (`markStale`) and re-enqueue; the
  `ai.embeddings-backfill` chain pages PUBLISHED problems missing READY
  triple rows (100/page, idempotent job ids, chained cursor, visible
  progress) and is admin-triggerable at `POST /admin/ai/embeddings/backfill`.
- Failure (provider/pgvector/timeout/empty) → safe empty result or lexical
  topic/rating-band fallback. **Never generated questions** — only real
  canonical rows.
- Evaluated on retrieval relevance, topic/difficulty consistency, and
  self-exclusion (`AiEvaluationService`, fixtures, admin-visible).

## 3 — Contribution Review (human-in-the-loop)

```
Contribution (PENDING, frozen snapshot) → validation → BullMQ review job
→ structured AI output → Zod validation → ContributionAiReview (advisory)
→ Admin queue → human Approve / Reject / Request changes → publish/reject
```

AI output is metadata on the contribution; only the admin transition mints
library content. Flag off, provider unconfigured, or model failure →
stays PENDING with a recorded usage row, manual review continues. The
reviewer model is versioned (`ai-reviewer-v1`); admin decisions vs AI
recommendations feed the override signal (`ai-quality-loop.md`).
Duplicate candidates union trigram title matches with pgvector semantic
neighbors (labeled `trigram`/`vector`/`both` in the admin UI); the vector
channel degrades silently to trigram-only when the provider is unconfigured.
Evaluated on classification consistency, duplicate detection, answer
consistency, and schema validity.

## Versions (traceability)

| Artifact                 | Value                                    | Location                               |
| ------------------------ | ---------------------------------------- | -------------------------------------- |
| Coach prompt             | `COACH_PROMPT_VERSION` (`2026-09-02.v1`) | `coach-graph.ts`, logged per call      |
| Coach graph topology     | `COACH_GRAPH_VERSION` (`2026-09-02.v1`)  | `coach-graph.ts`, returned in result   |
| Coach schema             | `COACH_SCHEMA_VERSION` (`2026-09-01.v1`) | `coach-graph.ts`                       |
| Embedding representation | `NORMALIZATION_VERSION` (`1`)            | `embedding.service.ts`, stored per row |
| Evaluation fixtures      | `EVAL_VERSION` (`2026-09-02.v2`)         | `coach-fixtures.ts`, stamped per run   |

Bump the matching version whenever prompts, topology, schemas,
representation, or fixtures change so runs stay comparable.

## Timeouts / retries / limits

| Scope                      | Setting                                                                                                       | Location                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Coach graph run            | 75 s abort + recursionLimit 20                                                                                | `coach-graph.ts`                            |
| Coach tool call            | 10 s each, ≤2 bound rounds, ≤12 total                                                                         | `coach-graph.ts`                            |
| Coach finalize             | structured → 1 repair → text parse → fallback                                                                 | `coach-graph.ts`                            |
| LLM HTTP call              | 30 s, 1 retry (LangChain)                                                                                     | `buildCoachModel`                           |
| Legacy provider HTTP       | 60 s                                                                                                          | `llm-provider.ts`                           |
| Embedding duplicate lookup | 25 s, then trigram-only                                                                                       | `admin-contributions.service.ts`            |
| Coach route                | 20 req/min + per-user daily budget                                                                            | `ai.controller.ts`, `AiUsageTrackerService` |
| Similar route              | 30 req/min + 1 h result cache                                                                                 | `search.controller.ts`                      |
| Review flow                | LLM reviewer when flagged on + configured, else honest deferral; failures stay PENDING, never retried blindly | `ai.processor.ts`                           |
| Embedding jobs             | retries=3 + backoff, deterministic ids                                                                        | `QueueModule`, `ai.constants.ts`            |

Model/provider outage: bounded retries → deterministic fallback → recorded
failure. Invalid input is never retried indefinitely (one repair, then fail
safe).

## Cost controls

- Per-user daily budget per feature (`AI_DAILY_LIMIT`, Redis counter,
  fail-open with warning); `AI_DAILY_LIMIT=0` disables AI without redeploying.
- Bounded context (12 KB grounding, 4 KB per tool result), run-scoped tool
  cache (no repeated PostgreSQL reads), single repair retry, result caching
  (coach summary 10 min, similar 1 h), embedding batching
  (`embedBatch`, backfill pages of 100).
- Usage rows (`AiUsageLog`) + structured `ai.call` lines for audit.

## Security boundaries

- Tools close over the authenticated userId; no tool schema accepts a userId,
  so the model cannot redirect reads (covered by graph tests).
- No SQL, repositories, secrets, writes, or cross-user access from model
  paths. Retrieved problem text is untrusted data: it feeds DATA sections,
  never instructions; the system prompt hierarchy is code-controlled.
- RAG filters (PUBLISHED + READY + exact triple + self-exclusion) run in SQL
  and again in `isEligibleCandidate`; similarity never bypasses visibility.
- No passwords, tokens, profiles, or answers in telemetry — feature, model,
  versions, latency, tokens, validation, fallback, tool/retrieval counts only.

## Failure matrix

| Failure                      | Behavior                                                                    |
| ---------------------------- | --------------------------------------------------------------------------- |
| Provider unconfigured/down   | Deterministic coach summary; lexical similar fallback; review stays PENDING |
| Invalid model output         | 1 repair retry → text fallback → deterministic summary; logged              |
| pgvector down / dim mismatch | Lexical fallback; logged; platform unaffected                               |
| No similar results           | Empty list + honest empty state (never fabricated)                          |
| Stale/wrong-version rows     | Excluded by triple filter + app-layer guard                                 |
| Budget exhausted             | 429-style denial with deterministic fallback                                |
| Graph timeout                | Abort → deterministic fallback; logged                                      |

## Evaluation (measured, v2)

`AiEvaluationService.runAll()` — deterministic, no LLM/network/production
data, admin-visible at `GET /admin/ai/evaluations`. Last measured run:
**17/17 passed** (5 coach-grounding, 3 rag-rerank, 6 rag-exclusion,
3 review-schema). No accuracy percentages are claimed: suites assert
schema validity, grounding exclusion, rerank ordering, and filter
correctness on synthetic fixtures.

## Launch operations (Prompt 24)

- Rollout + kill-switches: `docs/feature-flags.md`, `docs/rag-rollout.md`
  (each AI capability is independently disableable; core flows never depend
  on providers — flag-off behaves exactly like provider outage).
- Quality loop: `docs/ai-quality-loop.md`. Signals at
  `GET /admin/ai/quality` (usage success/fallback, user verdicts, RAG
  source shares, review overrides/deferrals); user intake at
  `POST /ai/feedback`. Feedback is advisory only — human review is required
  before it changes evaluation assumptions, and nothing auto-applies.
- Re-embedding safety: `POST /admin/ai/embeddings/backfill?dryRun=true`
  previews counts with zero writes; the chain is paged, idempotent per page,
  resumable by cursor, and version-isolated by embedding triple.
- Correlation: every AI/queue row carries the originating `requestId`
  (`docs/observability-correlation.md`); logs are redacted centrally.
