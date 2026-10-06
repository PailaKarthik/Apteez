# ApteeZ — Production deploy (Vercel + Render, Singapore)

Target topology (all Singapore — the single-region rule in DEPLOYMENT.md §7):

```
Browser (India)
  → Vercel web, region sin1 ......... Next.js frontend (free)
  → Render apteez-api, Singapore ..... NestJS API, Starter (never sleeps)
  → Render apteez-worker, Singapore .. BullMQ worker, Starter
  → Neon PostgreSQL, ap-southeast-1 .. pooled runtime URL (only permanent DB)
  → Upstash Redis, Singapore ......... sessions / throttle / queues / caches
```

Total baseline cost: ~$14/mo (2 × Render Starter $7). Everything else free tier.

## 0. About Render sleep — read this first

There is **no code bypass** for free-tier sleep, and no setting in this
repo pretends otherwise. How it actually works:

- **Free web service:** Render spins it down after ~15 idle minutes. The
  first request after that waits 30–60s for a cold boot. No header, no
  ping interval, no keep-alive trick inside your code can prevent it —
  the proxy stops routing to a sleeping container, period.
- **This blueprint uses `plan: starter` on both services.** Starter never
  sleeps. That is the bypass, and it is the only honest one.
- **If you insist on free tier anyway:** the damage is limited to the
  first visitor after idle. Two mitigations, both partial:
  1. The web app already pings `GET /health` every 60s per open tab
     (`useKeepWarm`), so active usage never sleeps.
  2. Add a free external pinger (UptimeRobot / cron-job.org) hitting
     `https://<api>/api/v1/health/live` every 10 minutes. This keeps the
     container warm most of the day, but Render still counts 750 free
     hours/month and may sleep it regardless — expect occasional cold
     boots. For a live game with a countdown clock, those boots ruin
     matches. Use Starter.

## 1. Prerequisites

- [ ] Repo pushed to GitHub with `render.yaml` at root (this file).
- [ ] Neon project in **ap-southeast-1 (Singapore)**, migrated + seeded:
      `node scripts/db/region-move.mjs --yes` (or fresh `db:deploy` + seed).
- [ ] Your local `.env` holds the Singapore `DATABASE_URL` (pooled, with
      `?pgbouncer=true`) and `DIRECT_URL` (direct). Without
      `pgbouncer=true` the API crashes on the pooler — never remove it.

## 2. Upstash Redis in Singapore (2 min)

Upstash console → Create Database → region **Singapore** (`ap-southeast-1`)
→ copy the `rediss://default:<token>@<host>:6379` URL.

Do not reuse a US/EU Redis: every session lookup and throttle check pays
that region gap (measured 266ms vs ~5ms same-region). Switching Redis logs
everyone out once — Redis holds nothing permanent by design.

## 3. Render: API + worker from the blueprint (10 min)

1. Render dashboard → New → **Blueprint** → connect the repo. Render reads
   `render.yaml` and proposes `apteez-api` (web) + `apteez-worker`
   (background), both Singapore/Starter.
2. Fill every `sync: false` secret from your `.env`:
   `DATABASE_URL`, `DIRECT_URL`, `UPSTASH_REDIS_URL` (Step 2),
   `COOKIE_SECRET` (generate fresh — never reuse dev secrets verbatim;
   any 32+ random bytes), S3 keys, Google keys, Resend key, LLM keys.
3. Temporary placeholders (replaced in §4): `CORS_ORIGINS`,
   `APP_URL`, `API_URL`, `GOOGLE_CALLBACK_URL` → `https://placeholder.local`.
4. Deploy. First build takes 5–10 min (`pnpm install` + workspace builds).
   `preDeployCommand` runs `prisma migrate deploy` automatically (uses
   `DIRECT_URL`; expects "No pending migrations").
5. Verify: `https://<your-api>.onrender.com/api/v1/health` → HTTP 200 with
   `database: up, redis: up`. Copy the **actual** API URL from the
   dashboard (Render may append a suffix to the name).

What Render does per deploy: build → migrate → swap traffic only if
`/api/v1/health/live` passes. A failed migration blocks the rollout
instead of shipping broken code.

## 4. Wire the real URLs (5 min)

Render → `apteez-api` → Environment:

| Variable              | Value                                             |
| --------------------- | ------------------------------------------------- |
| `CORS_ORIGINS`        | `https://<your-app>.vercel.app` (Step 5 gives it) |
| `APP_URL`             | same Vercel URL                                   |
| `API_URL`             | `https://<your-api>.onrender.com`                 |
| `GOOGLE_CALLBACK_URL` | `<API_URL>/api/v1/auth/google/callback`           |

Save (auto-redeploys, ~2 min). Then Google Cloud Console → Credentials →
your OAuth client → Authorized redirect URIs → add the exact
`GOOGLE_CALLBACK_URL`. Google rejects mismatches with `redirect_uri_mismatch`
— copy-paste, don't retype.

## 5. Vercel: web frontend (5 min)

1. Import the repo → **Root Directory: `apps/web`** → Region **Singapore
   (sin1)** → Node.js **20.x**.
2. Override the commands (prevents the two classic pnpm-monorepo failures —
   installing inside `apps/web` cannot resolve workspace packages):
   - Install Command: `cd ../.. && corepack enable && pnpm install --frozen-lockfile`
   - Build Command: `cd ../.. && pnpm --filter @apteez/web build`
   - Output Directory: leave default (`.next` under `apps/web`).
3. Environment variables:
   - `NEXT_PUBLIC_API_URL` = `https://<your-api>.onrender.com/api/v1`
   - `NEXT_PUBLIC_SITE_URL` = `https://<your-app>.vercel.app`
     Both are inlined at build time — changing them later requires a
     redeploy. First deploy: use a guess for the site URL, then set the real
     one from the assigned domain and redeploy once.
4. Deploy → open the site → if the API rejects the browser with a CORS
   error, the `CORS_ORIGINS` in §4 doesn't match the real Vercel URL:
   fix it there, not in Vercel.

## 6. Prove it (10 min)

```powershell
$env:BASE_URL='https://<your-api>.onrender.com/api/v1'
node scripts/smoke/prod-smoke.mjs   # read-only post-deploy smoke
```

Then click through the real flows on the Vercel URL:

1. Home loads in ~1s warm (no 10s spinners).
2. Play one 1v1 duel: matched → digits → GO **with questions** → answers
   ack instantly → result shows ±rating.
3. Profile → rating graph shows the new point.
4. `/robots.txt` and `/sitemap.xml` resolve.

## 7. After launch (not blockers)

- The Singapore DB currently holds **dev seed data** (sample users and
  problems). Fine for launch testing; before real users, branch a clean
  production database in Neon and run `db:bootstrap` (structural data
  only) instead of the dev seed.
- The asset bucket is still Ohio (`us-east-2`) — images work, just slower.
  Move to a Singapore bucket/R2 later and flip `S3_*` + `render.yaml`.
- Custom domain: Vercel (web) first, then Render custom domain for the API,
  updating `CORS_ORIGINS`/`APP_URL`/`API_URL`/OAuth callback to match.

## Troubleshooting (errors seen before — exact fixes)

| Symptom                                                             | Cause                                                                            | Fix                                                                       |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| API crash-loop, `P2037`/prepared-statement errors                   | `DATABASE_URL` missing `?pgbouncer=true`                                         | Pooled URL must end `?sslmode=require&pgbouncer=true&connection_limit=10` |
| Boot fail: `DATABASE_URL is required` / `COOKIE_SECRET must be set` | `validateEnv` fail-fast (§3 secrets empty or placeholder)                        | Fill every `sync: false` var; `COOKIE_SECRET` ≠ `change-me-in-production` |
| Deploy stuck at migrate                                             | `DIRECT_URL` points at pooler host (`-pooler`) — DDL can't run through PgBouncer | Use the **direct** Neon URL for `DIRECT_URL`                              |
| Browser: CORS error on every API call                               | `CORS_ORIGINS` ≠ Vercel URL (scheme/host must match exactly)                     | Fix in Render env (§4), no Vercel change needed                           |
| Google login: `redirect_uri_mismatch`                               | Callback not registered verbatim                                                 | Google Console URI == `GOOGLE_CALLBACK_URL` char-for-char                 |
| Vercel build: `Cannot find module '@apteez/ui'`                     | Install ran inside `apps/web`, workspace unresolved                              | Use the §5 install/build overrides exactly                                |
| Vercel pages call `localhost:3001`                                  | `NEXT_PUBLIC_API_URL` unset at build time                                        | Set it and **redeploy** (inlined, not runtime)                            |
| Sitemap/OG point at localhost                                       | `NEXT_PUBLIC_SITE_URL` unset                                                     | Set to Vercel URL and redeploy                                            |
| First request slow (~30s), then fast                                | Free plan sleeping (see §0)                                                      | Starter, or accept it + external pinger                                   |
