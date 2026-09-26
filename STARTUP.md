# ApteeZ — Startup Brief

## Product concept

A competitive aptitude arena for India's placement and government-exam
pipeline (campus placements, SSC, Banking, Railways, GATE, TCS NQT, UPSC
CSAT). Instead of static PDFs and isolated mock tests, aspirants train in a
live ecosystem: solve, duel, compete, streak, earn, and contribute back.

## Target users

1. **Aspirants** (primary) — students and early-career candidates preparing
   for aptitude rounds. Want measurable progress and peer competition.
2. **Organizers** — placement cells, clubs, coaching communities running
   contests/events for their cohorts.
3. **Contributors/moderators** — power users growing the question library and
   keeping the community clean.

## Core competitive loop

```
Practice → Challenge (1v1) → Contest → Rating ↑ → Streak/Rewards →
Weak-area feedback → Targeted practice → …
```

Every loop step writes authoritative history (submissions, ratings, ledger,
activity rollups) that powers the profile, the coach, and recommendations.

## Product modules (implementation status — honest)

| Module                                             | Status                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Auth (sessions, Google OAuth, RBAC)                | Implemented                                                                                       |
| Problems / practice / submissions                  | Implemented                                                                                       |
| Favorites                                          | Implemented                                                                                       |
| 1v1 Challenge (matchmaking, live, rating)          | Implemented (single-process realtime)                                                             |
| Contests (registration → results → rating)         | Implemented                                                                                       |
| Events + organizations                             | Implemented                                                                                       |
| Learning paths / explore                           | Implemented                                                                                       |
| Leaderboard / ratings                              | Implemented                                                                                       |
| Discussions + moderation + reports                 | Implemented                                                                                       |
| Contributions + admin review queue                 | Implemented                                                                                       |
| Profile / analytics / achievements / streaks       | Implemented                                                                                       |
| Points / rewards / redemptions                     | Implemented                                                                                       |
| Search / autocomplete / trending / recommendations | Implemented                                                                                       |
| Notifications (in-app inbox + fanout)              | Implemented                                                                                       |
| Admin panel + audit log                            | Implemented                                                                                       |
| AI Performance Coach                               | Implemented (staged pipeline, deterministic fallback)                                             |
| RAG Similar Problems (pgvector)                    | Implemented (vector + lexical fallback)                                                           |
| AI Contribution Review                             | Partially implemented (deterministic precheck + pipeline; LLM reviewer deferred to configuration) |
| AI Tutor                                           | **Deferred — not implemented by decision**                                                        |
| Production deployment (AWS/CI/Docker)              | Implemented as code + docs; cloud provisioning is operator-run                                    |

## Future monetization direction (planned, not built)

- Institutional plans for placement cells (private events, cohort analytics).
- Premium prep tracks (adaptive plans, deep analytics).
- Reward partnerships (sponsored catalog).

No billing code exists today; the points/ledger model is designed so paid
wallets can attach later without rewriting history.

## Growth / community model

Contributor flywheel: solvers → contributors → reviewed library → more
solvers. Moderation + human-in-the-loop review keep quality trustworthy;
achievements and streaks supply retention.

## Future roadmap (planned)

- Socket.IO Redis adapter for multi-instance API horizontal scale.
- Fulfillment flow for physical reward redemptions (redemption ledger + admin transitions exist; fulfillment itself is manual).
- Mobile client over the same versioned API + bearer sessions.
- Password change/reset flow (session revoke on suspend/ban exists; see `docs/tech-debt.md`).
