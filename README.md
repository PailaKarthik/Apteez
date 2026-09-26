# ApteeZ — Competitive Aptitude Ecosystem

> Daily practice, live 1v1 duels, timed contests, community events, and a
> contributor-reviewed question library for placement and government-exam aspirants.

Aptitude prep is lonely and unmeasurable. ApteeZ makes it competitive and
measurable: every attempt feeds ratings, streaks, weak-area analysis, and an AI
Performance Coach, so learners always know what to practice next.

---

## ✨ What it does

| Surface            | Highlights                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Practice**       | Topic-organized library, server-graded submissions, favorites, revision signals. Contest solves count too.                                               |
| **1v1 Challenges** | Redis matchmaking + Socket.IO live rooms, server-owned timers/scoring, Elo-style ratings.                                                                |
| **Contests**       | Registration windows, frozen question sets, fullscreen lockdown, auto-submit, live standings with rating deltas, post-contest Elo + pace bonus, upsolve. |
| **Events**         | Official vs community, public/private/university visibility, entry codes, invites, 170-university directory, live participation, results.                |
| **Contributions**  | Member-submitted questions → deterministic precheck → advisory AI review → mandatory human approval.                                                     |
| **Rewards**        | Trigger-based points engine (admin-managed rules, caps, cooldowns), achievements, streaks, redemption catalog.                                           |
| **Learning**       | Paths, lessons, progress + resume, weak-area coaching.                                                                                                   |
| **Community**      | Discussions, replies, reactions, reports, moderation queue.                                                                                              |
| **AI (advisory)**  | Performance Coach, RAG similar problems (pgvector), contribution review. Never authoritative. See `AI.md`.                                               |

---

## 🏗 Architecture

```text
apps/
  web/                 Next.js 14 (App Router) — SSR pages, TanStack Query, Tailwind
  api/                 NestJS 10 — REST (/api/v1) + Socket.IO, BullMQ workers
packages/
  database/            Prisma 6 schema, migrations, seeds, generated client
  types/               Shared DTOs (single contract, API ↔ web)
  validation/          Zod schemas (request validation, shared with forms)
  ui/ · config/        Design system, nav/config, shared TS + ESLint presets

Neon Postgres (pooled, pgvector)      ← permanent data. Redis never holds any.
Upstash Redis                         ← sessions, locks, matchmaking, rate limits
```

**Non-negotiable engineering rules**

- **Server-authoritative everything.** Timers, scoring, correctness, ranks,
  ratings and money-adjacent math are computed server-side. The client is a
  display terminal — even the contest auto-submit only fires on the server's
  `remainingSeconds`.
- **Pooler-safe persistence.** Neon PgBouncer kills interactive transactions
  (`P2028`), so writes use single statements, conditional updates and
  reason-scoped idempotency keys. Retries converge; nothing double-applies.
- **Two roles, nothing else.** `user` creates only via contributions;
  `admin` holds all grants. Ownership checks apply per object.
- **AI advises, humans decide.** Publishing, grading and moderation are
  deterministic code paths; AI output is surfaced as advisory only.

---

## 🧰 Tech stack

| Layer    | Choices                                                                         |
| -------- | ------------------------------------------------------------------------------- |
| Language | TypeScript 5.6 (strict), Node ≥ 20, pnpm 9                                      |
| Backend  | NestJS 10, Prisma 6, BullMQ, Socket.IO, Helmet, Throttler                       |
| Frontend | Next.js 14, React 18, TanStack Query 5, react-hook-form + Zod, Recharts, Sonner |
| Data     | Neon Postgres + PgBouncer + pgvector · Upstash Redis                            |
| Auth     | Opaque Redis sessions (HTTP-only cookie), Google OAuth, Resend email OTP        |
| Quality  | Jest (API) · Vitest (web) · ESLint · Prettier · Turbo                           |
| Deploy   | Docker images per app (`apps/*/Dockerfile`), `scripts/smoke`, `deploy:verify`   |

---

## 🚀 Quickstart

**Prerequisites:** Node ≥ 20 · pnpm 9 · a Neon project · an Upstash Redis database.

```bash
# 1. Install
pnpm install

# 2. Configure — every variable is documented in .env.example
copy .env.example .env          # Windows PowerShell (or: cp .env.example .env)
# Fill in: DATABASE_URL (pooler, ?pgbouncer=true), DIRECT_URL (direct),
#          UPSTASH_REDIS_URL, plus optional OAuth / Resend / AI keys.

# 3. Database — migrate, generate the client, load structural data
pnpm db:deploy
pnpm db:generate
pnpm --filter @apteez/database exec dotenv -e ../../.env -- tsx prisma/bootstrap.ts

# 4. Run it (API :3001 · web :3000)
pnpm dev
```

> ⚠️ `pnpm db:generate` rewrites the Prisma engine DLL — **stop the dev
> servers first** or you'll hit an `EPERM` rename on Windows.

### Everyday commands

| Command                                  | What it does                                    |
| ---------------------------------------- | ----------------------------------------------- |
| `pnpm dev`                               | Turbo: API watch + web dev                      |
| `pnpm build`                             | Production builds (`dist/`, `.next/`)           |
| `pnpm typecheck`                         | `tsc --noEmit` across the monorepo              |
| `pnpm test`                              | Jest suites (API) + Vitest suites (web)         |
| `pnpm lint` / `pnpm format`              | ESLint / Prettier write                         |
| `pnpm db:deploy`                         | Apply pending migrations (safe with servers up) |
| `pnpm db:seed`                           | Dev content seed (never production)             |
| `pnpm db:studio`                         | Prisma Studio                                   |
| `pnpm smoke:prod` / `pnpm deploy:verify` | Post-deploy health checks                       |

---

## 📁 Monorepo map

```text
apps/api/src/modules/
  auth · users · profile · problems · submissions · practice
  challenge · contest · events · organizations
  contributions · admin/* · rewards · achievements
  learning · discussions · favorites · leaderboard · ratings
  search · notifications · analytics · ai · storage · queue · redis
apps/web/src/
  app/            → routes: practice, challenges, contests, events,
                    contribute, rewards, learn, discussions, leaderboard, profile
  components/     → feature UI (contest arena, lockdown, wizards, boards…)
  hooks/          → typed TanStack Query layer over the REST API
packages/database/prisma/
  schema.prisma   → 40+ models, the whole domain in one file
  migrations/     → forward-only SQL, deploy-safe while servers run
  seed-data.ts    → taxonomy, RBAC, reward rules, 170 Indian universities
docs/  ARCHITECTURE.md · DEPLOYMENT.md · SECURITY.md · AI.md · STARTUP.md
```

---

## 🔌 API at a glance

Base path `/api/v1`. Anonymous discovery where safe; mutations need the
session cookie. Admin routes additionally require the matching grant.

```text
POST /auth/register|login · POST /auth/email/verify-* · Google OAuth
GET  /problems · GET /problems/:id|/next · POST /submissions/attempts
POST /challenges/match · WS challenge rooms · POST /challenges/:id/rating/retry
GET  /contests · POST /contests/:id/{register,start,answer,submit}
GET  /contests/:id/{session,leaderboard,result,upsolve} · POST /contests/:id/ratings/retry
GET  /events · POST /events/:id/{register,join} · entry-code + invite + org-member gates
POST /contributions · GET /admin/contributions/:id · approve|reject|edit (admin)
GET  /rewards/{points,catalog,rules} · POST /rewards/redeem
GET|POST|PATCH /admin/reward-rules · GET|PATCH /admin/achievements
GET  /users/:username · /users/:username/overview (privacy-gated)
GET  /profile/me/* (performance, rating-history, heatmap, streak, achievements)
```

---

## 🧪 Testing philosophy

- **Unit + service specs with mocked Prisma** (Jest): ledger idempotency,
  trigger fan-out, rating math, access gates, lifecycle transitions.
- **Component tests** (Vitest + Testing Library): wizards, dialogs,
  navigation, empty/error/loading states.
- **Journey + smoke scripts** (`scripts/`): end-to-end assertions against
  staging/prod builds, including seed-guard rails (staging seeds refuse
  production databases).

---

## 🚢 Deployment

- `apps/api/Dockerfile` + `apps/web/Dockerfile` → registry → host.
- `pnpm db:deploy` against `DIRECT_URL` on release, then `pnpm smoke:prod`.
- Secrets (`DATABASE_URL`, OAuth, Resend, AI keys) come from the host
  environment — never committed (see `.gitignore`; only `.env.example`
  files are tracked).
- Details: `DEPLOYMENT.md` · `SECURITY.md` · `infrastructure/docker/`.

---

## 🤝 Contributing

1. Branch from `main`, keep PRs focused.
2. `pnpm format && pnpm typecheck && pnpm test` — all green before review.
3. Migrations are hand-written SQL + `db:deploy`-verified; regenerate the
   client (`db:generate`, servers stopped) whenever `schema.prisma` changes.
4. Server owns correctness: never trust client-supplied amounts, answers,
   ranks or clocks.

## 📄 License

Private project — all rights reserved. Contact the repository owner for
licensing questions.
