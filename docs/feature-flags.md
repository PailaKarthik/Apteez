# Feature flags

Minimal env-based flags for risky/new functionality. No flag service to
operate; changing a flag is a redeploy. Implementation:
`apps/api/src/config/feature-flags.ts` (+ spec).

## Registry

| Flag                      | Env                               | Default | Off behavior (server-enforced)                                 |
| ------------------------- | --------------------------------- | ------- | -------------------------------------------------------------- |
| `AI_PERFORMANCE_COACH`    | `FEATURE_AI_PERFORMANCE_COACH`    | on      | Coach serves the deterministic summary; profile works normally |
| `AI_SIMILAR_PROBLEMS`     | `FEATURE_AI_SIMILAR_PROBLEMS`     | on      | Vector retrieval skipped; lexical related-problem fallback     |
| `AI_CONTRIBUTION_REVIEW`  | `FEATURE_AI_CONTRIBUTION_REVIEW`  | on      | No review job scheduled; contribution waits PENDING for humans |
| `REWARDS_REDEMPTION`      | `FEATURE_REWARDS_REDEMPTION`      | on      | Catalog/ledger read; `redeem` → 503                            |
| `PUBLIC_EVENTS`           | `FEATURE_PUBLIC_EVENTS`           | on      | Anonymous listing → 503; signed-in users unaffected            |
| `COMMUNITY_CONTRIBUTIONS` | `FEATURE_COMMUNITY_CONTRIBUTIONS` | on      | Submit → 503; reading own contributions works                  |

Each flag optionally takes `<ENV>_ROLLOUT=0–100`: a deterministic
`FNV(flag:userId) % 100 < rollout` bucket, stable across requests and
instances with no stored state. Anonymous callers with a rollout configured
read **disabled** (fail-closed). Unrecognized values warn at boot and keep
the default.

## Rules

1. **Server-side only.** `GET /flags` is a boolean snapshot for UX hiding;
   every gate above is checked in the API before the risky path runs. All
   six kill paths were verified live (503s + lexical/deterministic serving).
2. **AI flags degrade, never break.** Core flows (solving, challenge,
   contest, events, learning, discussions, profile) never depend on AI
   availability — provider outage and flag-off behave identically.
3. **Never fabricate.** Similar Problems off means fewer/smaller related
   lists from the lexical band, never generated questions.
4. **No Weekly Targets flag** exists on purpose — see `launch-strategy.md`.

## Incident use

LLM provider down → set `FEATURE_AI_PERFORMANCE_COACH=false` (and
`FEATURE_AI_SIMILAR_PROBLEMS=false` if embeddings are affected), redeploy,
watch `GET /admin/ai/quality` fallback rates, re-enable gradually
(rollout 10 → 50 → unset). Same pattern for reward abuse
(`FEATURE_REWARDS_REDEMPTION=false`) and event spam
(`FEATURE_PUBLIC_EVENTS=false`). Operator view: `GET /admin/flags`.
