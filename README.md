# ApteeZ

ApteeZ is a competitive aptitude ecosystem — daily challenges, live contests,
a community question library, rankings, discussions, events and user
contributions — built as a production-quality monorepo.

This repository currently implements **Prompts 01–10**: the application shell
and design system, API error contract, full database schema (identity, RBAC,
auth identities and content/library foundations), Redis/storage abstractions,
email/password plus Google OAuth architecture, Redis-backed sessions and
database-backed RBAC, the **question engine** (categories → topics →
subtopics → problems with filtering, cursor pagination, search, exam tags and
answer-safe DTOs), the **practice engine** (server-scored attempts, idempotent
submission, recent history and per-problem stats), the **favorites &
collections layer** (a system default Favorites collection plus user-created
collections), the **1v1 challenge engine** (Redis matchmaking, a
server-authoritative live duel over Socket.IO, +1/−1 scoring and persistent
results), and the **challenge rating engine** (isolated Elo-style per-domain
ratings, atomic idempotent updates and auditable history). Contest gameplay,
contest rating and review workflows land in later prompts without
restructuring.

## Architecture

```text
apps/web  (Next.js 14, React 18, Tailwind, shadcn-style UI, TanStack Query)
   │  REST /api/v1/*, shared envelope + error contract
apps/api  (NestJS 10, TypeScript, Zod validation, versioned at /api/v1)
   ├── PostgreSQL (permanent data) via Prisma — packages/database
   ├── Redis (ephemeral/live state) via ioredis
   └── Object storage via provider-agnostic StorageService (local | S3)
```

- The backend is authoritative for scores, timers, results, ratings, rewards
  and permissions. The browser is never trusted for competitive outcomes.
- Every API response uses the shared envelope in `@apteez/types`
  (`{ success: true, data }` / `{ success: false, error, requestId }`).
- Zod is the single validation library (`@apteez/validation`), shared by web
  forms and the API validation pipe.
- Weekly Targets ships as **Coming Soon** (route + nav stay visible, feature
  flag off). Contribute is a real area with local drafts; server submission
  and review arrive later.
- **Question engine (Prompt 05)**: `GET /api/v1/problems` (filters: category,
  topic, difficulty, rating range, exam tag, search, solved/favorited for
  signed-in callers; allowlisted sorts; keyset cursor pagination),
  `GET /api/v1/problems/:id`, `GET /api/v1/categories`,
  `GET /api/v1/categories/:slug/topics`, `GET /api/v1/topics/:slug/problems`,
  `GET /api/v1/exam-tags`. Public DTOs never carry `isCorrect`; unpublished
  problems 404 for regular users; asset URLs are minted through the storage
  abstraction. Explore, Home and `/problems/:id` consume these endpoints.
- **Favorites & collections (Prompt 07)**: `GET|POST|DELETE /api/v1/favorites`
  (+ `/favorites/membership?problemIds=…` for bulk membership), `GET|POST
/api/v1/favorite-collections`, `PATCH|DELETE /api/v1/favorite-collections/:id`
  and `GET|POST|DELETE /api/v1/favorite-collections/:id/problems[/:problemId]`.
  Favorites is a normal collection carrying system rules: it is created
  automatically, cannot be renamed or deleted, and is enforced as
  `DEFAULT_COLLECTION_IMMUTABLE` server-side. Ownership is checked on every
  read/write (another user's collection returns 404, not 403, so ids cannot be
  probed); `(collectionId, problemId)` is unique at the database level so
  duplicate membership is impossible; concurrent adds/deletes/toggles converge
  because the mutations are idempotent and tolerate the P2002 race.
- **Challenge engine (Prompt 08)**: Socket.IO namespace `/challenge` drives
  matchmaking → countdown → live duel → result, all server-authoritative. REST
  surface: `GET /api/v1/challenges/domains`, `GET /api/v1/challenges` (active),
  `GET /api/v1/challenges/history`, `GET /api/v1/challenges/:id`,
  `GET /api/v1/challenges/:id/result`. Matchmaking queues live in Redis
  (`mm:queue:<domain>` / `mm:user:<id>`, per-domain locks, rating windows that
  widen with wait time); challenges, their server-selected question set,
  per-player answers and per-domain `ChallengeRating` rows (default 1000) are
  persisted in PostgreSQL. The server owns the timeline, question order,
  correctness, +1/−1 scoring and the winner; questions never expose
  `isCorrect` before completion; finalization is a single atomic claim so
  concurrent submissions yield exactly one result. Socket events use the
  `challenge:*` names in `@apteez/types`.
- **Challenge rating engine (Prompt 10)**: an isolated, deterministic Elo-style
  engine (`RatingCalculator` — pure, framework-free) keeps a **separate rating
  per aptitude domain**, lazily created at 1000 and stored as whole points.
  Ratings move only for finalized challenges and only server-side, in one
  transaction; `ChallengeRatingHistory` is append-only with a unique
  `(challengeId, userId)` key, so retried jobs and concurrent workers cannot
  apply a match twice. Read endpoints: `GET /api/v1/ratings/me`,
  `GET /api/v1/ratings/history` (cursor-paginated, filterable),
  `GET /api/v1/ratings/users/:username` and
  `GET /api/v1/ratings/leaderboard?domain=&institution=`. Profile and
  Leaderboard surfaces consume these; the challenge result screen shows the
  authoritative per-player rating change once processing completes.
- **Practice engine (Prompt 06)**: `POST /api/v1/problems/:id/attempts`
  (start), `POST …/attempts/:attemptId/submit` (server-scored, idempotent —
  replayed/concurrent submits resolve to one finalized result), `POST
…/attempts/:attemptId/abandon`, `GET /api/v1/problems/:id/stats`
  (personal attempts/accuracy/time) and `GET /api/v1/submissions/recent`
  (lightweight history). Attempts follow `STARTED → SUBMITTED | ABANDONED`;
  a problem is **solved** when the user has a SUBMITTED correct attempt.
  Timing is computed server-side from `startedAt` (client hints are kept but
  never trusted), the answer is only revealed after submission, and the
  submit route carries its own Redis-backed throttle.
- **Authentication (Prompt 03)**: opaque server-side sessions in Redis
  (SHA-256 hashed; the client only holds the HTTP-only `SameSite=Lax`
  cookie, or `Authorization: Bearer` for the future mobile app). Endpoints:
  `POST /api/v1/auth/register|login|logout`, `GET /api/v1/auth/me`,
  `GET /api/v1/auth/google[?next=]` + `/google/callback` (graceful 503
  `OAUTH_NOT_CONFIGURED` when credentials are absent). Guards run globally:
  throttle → session → roles → permissions (`@Public()`, `@Roles()`,
  `@Permissions('review:contributions')`). Login/register are rate-limited
  per IP plus a per-account failed-login budget (429). CSRF defense: an
  Origin/Referer allowlist check on mutating requests.

More detail: [`docs/architecture.md`](docs/architecture.md).

## Repository structure

```text
apps/
  web/                 Next.js frontend (App Router)
  api/                 NestJS backend (REST, /api/v1)
packages/
  config/              Framework-agnostic brand, navigation, feature flags
  database/            Prisma schema, migrations, seed, Prisma client module
  types/               Shared API contracts (envelope, error codes, enums)
  validation/          Shared Zod schemas (single validation library)
  ui/                  shadcn-style primitives + loading/error/empty states
  eslint-config/       Shared ESLint flat configs (base / next / node)
  tsconfig/            Shared TypeScript configs (base / nextjs / nestjs / react-library)
infrastructure/
  docker/              docker-compose for local PostgreSQL + Redis
docs/                  Architecture notes
```

## Prerequisites

- Node.js ≥ 20 (tested on Node 24)
- pnpm 9 (`npm install -g pnpm@9.15.9`, repo pins `packageManager`)
- Docker + Docker Compose (for local PostgreSQL and Redis)

## Local setup

```powershell
# 1. Install dependencies (workspace root)
pnpm install

# 2. Configure environment
copy .env.example .env
copy apps\web\.env.example apps\web\.env.local   # optional; defaults already work

# 3. Start PostgreSQL + Redis
pnpm docker:up

# 4. Apply migrations and seed foundation data (roles, dev users, taxonomy)
pnpm db:migrate -- --name init   # first run only; afterwards plain `pnpm db:migrate`
pnpm db:seed

# 5. Start everything (turbo builds shared packages first)
pnpm dev
```

- Web: http://localhost:3000 · API: http://localhost:3001/api/v1/health

## Environment setup

- Root `.env` (gitignored, copied from `.env.example`) drives the API,
  Prisma CLI and Docker Compose. The API also accepts `apps/api/.env`,
  which takes precedence when present.
- `apps/web/.env.local` (gitignored) holds `NEXT_PUBLIC_API_URL`, inlined
  into the client bundle — never put secrets in `NEXT_PUBLIC_*` variables.
- The API validates its environment with Zod on boot and refuses to start
  with a readable error when required variables are missing or invalid.
  Google OAuth and server-session variables are reserved (commented) for the
  auth prompt.

## Development commands

| Command                              | What it does                                     |
| ------------------------------------ | ------------------------------------------------ |
| `pnpm dev`                           | Run web + api with Turborepo (builds deps first) |
| `pnpm build`                         | Production builds for all packages/apps          |
| `pnpm lint`                          | ESLint across the workspace                      |
| `pnpm typecheck`                     | Strict `tsc --noEmit` across the workspace       |
| `pnpm test`                          | Unit tests (Jest for api, Vitest for web)        |
| `pnpm --filter @apteez/api test:e2e` | API e2e over HTTP (needs Docker services)        |
| `pnpm format` / `pnpm format:check`  | Prettier write / check                           |

## Database setup

```powershell
pnpm db:generate   # regenerate the Prisma client
pnpm db:migrate    # create + apply a migration in dev
pnpm db:deploy     # apply pending migrations (prod-style)
pnpm db:seed       # idempotent foundation seed (roles, users, taxonomy, tags)
pnpm db:studio     # Prisma Studio explorer
```

Schema changes: edit `packages/database/prisma/schema.prisma`, run
`pnpm db:migrate -- --name <change>`, then `pnpm db:seed`. Migrations are
committed under `packages/database/prisma/migrations/`. The schema covers
identity + roles, the Category → Topic → Subtopic → Problem library,
contributions with review audit, exam tags, favorites collections,
submissions, per-scope ratings, points/achievements/streaks, plus minimal
contest/event/discussion boundaries. In non-interactive shells
`migrate dev` refuses to run — author the SQL with
`prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel
./prisma/schema.prisma --script` into a new `migrations/<ts>_<name>/`
folder, then apply with `pnpm db:deploy`.

Seeded dev accounts (development only): `admin@apteez.dev` /
`member@apteez.dev`, password `apteez-dev-only`. Emails and usernames are
CITEXT — uniqueness is case-insensitive at the database level.

## Docker usage

```powershell
pnpm docker:up     # start postgres:16 + redis:7 (healthy, persistent volumes)
pnpm docker:down   # stop (keeps data)
pnpm docker:logs   # follow service logs
```

Defaults (`apteez`/`apteez`, ports 5432/6379) match `.env.example`; override
with `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`,
`REDIS_PORT`. No AWS services are required for local development.

## Troubleshooting

- **API exits with `Cannot find module …`** — a direct import is missing from
  that package's `dependencies` (pnpm is strict; transitive deps are not
  visible). Add it and reinstall.
- **`prisma migrate` complains about `DATABASE_URL`** — make sure root `.env`
  exists; database scripts load it explicitly with `dotenv-cli`.
- **Port already in use** — stop stray `node dist/main` / `next-server`
  processes, or change `PORT` (api) / `--port` (web dev script).
- **Web shows “API offline”** on the home status card — start the API
  (`pnpm dev` runs both) or check `NEXT_PUBLIC_API_URL`.
- **ESLint crashes inside `@next/*` rules** — a few legacy pages-router rules
  use ESLint APIs removed in v9; they are permanently disabled in
  `packages/eslint-config/next.js` (App Router only needs the rest).
- **Page `<title>` tags** — ancestor `title.template` applies inconsistently
  across nesting depths in Next 14, so every page sets its full title via
  `pageMetadata()` in `apps/web/src/lib/metadata.ts`.
