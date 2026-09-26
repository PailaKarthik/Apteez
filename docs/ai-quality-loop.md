# AI quality loop

Pipeline: AI request → result → optional user/admin feedback → telemetry
(`ai_usage_logs`, `ai_feedback`, `rag_retrieval_logs`) → evaluation-dataset
candidate → **human-reviewed** evaluation case → prompt/model/retrieval
improvement. Raw feedback never retrains, re-prompts, or re-ranks anything
automatically.

## Signals

- Coach: `helpful` / `not_helpful` (`POST /ai/feedback`, authed, throttled).
- Similar: `relevant` / `not_relevant` (same endpoint, per-problem target).
- Review: `agree` / `disagree` written **only** by `recordReviewOutcome`
  from admin approve/reject vs the latest `ai-`-model recommendation. REVIEW
  recommendations and deterministic precheck rows produce no signal. The
  public endpoint refuses `contribution-review` verdicts (422) so signals
  cannot be forged. Admin decisions stay the ground truth for publication.
- Telemetry: success, fallback, latency, tool-call counts, retrieval
  source/counts — `GET /admin/ai/quality?days=30`.

## Using feedback

1. Mine low-feedback/high-fallback slices for _candidate_ cases.
2. A human curates candidates into the versioned eval suites
   (`ai/evaluations/`, currently v2 17/17) with expected outputs.
3. Prompt/model/retrieval changes must keep the eval suite green before
   rollout (flag + rollout percentage), then watched in the quality
   overview. Degradation → disable/reduce rollout → investigate → fix →
   evaluate → re-enable.

## Quality monitoring per feature

- Coach: success, validation failure, fallback rate, latency, verdict
  split, tool-call count. Watch: long requests, repeated tool calls,
  fallback spikes, output failures.
- Similar: retrieval success, empty rate, fallback rate, average results,
  `relevant` split. These are investigation signals, not quality scores.
- Review: success, structured-output failure, deferral count, override
  agree/disagree, review latency. Overrides measure the AI against admin
  truth — never the reverse.
