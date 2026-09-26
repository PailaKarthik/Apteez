# ApteeZ — How It Works

Notation: `→` is a call/transition. The NestJS API is authoritative for
scores, timers, results, ratings, points, and permissions in every flow.

## Challenge (1v1)

```
User clicks Start
→ Next.js (challenge arena, Socket.IO client)
→ NestJS ChallengeService (matchmaking request, Zod-validated)
→ Redis matchmaking queue + per-user pointer + domain lock
→ match found → Challenge row (PostgreSQL) + BullMQ activate/expire jobs
→ Socket.IO rooms (user:<id>, challenge:<id>) via ChallengeGateway
→ server starts timer (authoritative; client clock is a hint)
→ answers → server validation → score (+1 correct / −1 wrong)
→ duplicate answers idempotent (answered-position set in Redis)
→ timer end / leave / disconnect → finalizeOnce (single-writer lock)
→ PostgreSQL result → RatingService (Elo-style, idempotent by job id)
→ Leaderboard + rating history → Result screen
```

Reconnect: session re-resolves, socket rejoins user room, coordinator
restores state or marks disconnect-timeout after grace. Abandoned matches
finalize as ABANDONED; rating failures mark retryable, never roll back results.

## Contest

Registration (capacity-safe) → frozen question set published → participant
enters (startedAt/effectiveEndAt from server clock) → answers upsert per
(question, participant), correctness hidden until evaluation → submit or
auto-submit at deadline → immutable ContestResult rows → set-based rank
assignment → rating engine (idempotent per contest+user) → upsolve mode.

## Events

Organizer creates (DRAFT) → publishes → REGISTRATION_OPEN → capacity-checked
registration (row lock + unique guard, idempotent retry) → join/session →
participation answers → submit → results published → notifications fanned out
via BullMQ (paginated, never truncated). Invites, waitlists, and organizer
management ride the same state machine; every transition is server-side.

## Contributions

```
Submit (Zod) → Contribution row (PENDING, snapshot frozen)
→ deterministic precheck → ContributionAiReview (advisory metadata)
→ BullMQ AI review job (LLM reviewer when flagged on + configured, else
  honest deferral; structured output, Zod-validated; failures stay PENDING,
  never retried blindly)
→ Admin queue → human Approve / Reject / Request changes
→ approval mints a canonical Problem (library row), links resultingProblemId
→ notification to contributor
```

AI never publishes. AI down → contribution stays PENDING, manual review
continues. The contribution row is never deleted after approval (audit trail).

## Rewards / points

Rule-driven awards funnel through `PointsService.awardRule` (server-owned
amounts; clients name only a rule key). Each award = ledger row
(`PointTransaction` with running `balanceAfter`) + `UserPoints` mirror in one
DB transaction; retries dedupe on `(user, sourceType, sourceId, type)`.
Redemptions: balance check → deduction → redemption row → inventory update,
idempotent on client `idempotencyKey`. History (ledger, ratings, submissions,
results) is append-only and never rewritten by admin tools.

## Notifications

Event/contest/moderation actions enqueue fanout jobs → per-user inbox rows
(PostgreSQL) → unread counts + paginated inbox. Delivery is best-effort and
never blocks the triggering request; failures retry then stay inspectable.

## Learning / explore

Taxonomy (Category → Topic → Subtopic) + lessons + progress rows. Start is
idempotent, completion derives from lesson work (clients can't set
percentages). Resume, streaks, and heatmaps read precomputed
`UserActivityDaily` rollups rebuilt from authoritative records.

## Search / personalization

Lexical search (trigram-assisted) + suggestions/trending caches (short Redis
TTL) + per-user recommendation snapshots. Similar Problems runs the RAG
pipeline (see `AI.md`); failure falls back to topic/rating bands, never to
generated questions.

## Admin / moderation

RBAC area gates (`requireArea`) on every handler. Users, problems,
contributions, reports, discussions, contests, audit log, AI evaluations,
usage telemetry, and queue operations (`/admin/queues`) are admin-only.
Sensitive actions append to `AdminAuditLog`, which no API can update/delete.
