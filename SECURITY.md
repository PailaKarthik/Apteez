# ApteeZ — Security

## Authentication

- Passwords: scrypt hashes only (`PasswordService`); never plaintext, never
  logged. OAuth: Google; identity = `(provider, providerUserId)` unique —
  email alone never links accounts.
- Sessions: opaque random tokens, SHA-256 hashes in Redis (`sess:<hash>`),
  HTTP-only `SameSite=Lax` cookies (Bearer for future mobile), sliding TTL,
  immediate revoke, idempotent logout. Expired/invalid → 401.
- Errors are enumeration-safe (`INVALID_CREDENTIALS` for unknown account and
  wrong password alike; `ACCOUNT_EXISTS` hides which field collided).
- Never logged: passwords, tokens, cookies, authorization headers, OAuth
  secrets. Origin/Referer allowlist guards cookie mutations (CSRF).

## Authorization (RBAC)

- Global pipeline: `ThrottlerGuard → SessionAuthGuard → RolesGuard →
PermissionsGuard`. Admin handlers additionally call `requireArea` — backend
  authorization is authoritative; frontend roles are visibility only.
- IDOR: owner checks + explicit Prisma selects on every private read/write
  (profiles, collections, registrations, redemptions, audit).
- Registration assigns only the `user` role; role changes are admin ops;
  super_admin accounts are untouchable except by super admins.

## Secrets management

- No secrets in git (`.env` gitignored; `.env.example` placeholders only;
  gitleaks in CI). Runtime secrets come from environment / secret manager
  (AWS Secrets Manager in production). `NEXT_PUBLIC_*` is client-inlined —
  backend keys must never carry that prefix.
- Production fails fast without `COOKIE_SECRET`, S3 credentials (when
  `STORAGE_PROVIDER=s3`), and database/Redis URLs (`validateEnv`).

## Rate limiting & abuse

- Redis-backed layered throttling: global default, strict `auth` limiter,
  `practice`/`challenge` endpoint limiters, per-route `@Throttle` (e.g. AI
  coach 20/min), per-account login budget (429 on exhaustion), per-user
  WebSocket flood counters (fail-open, service layer re-validates).
- 429s are consistent; limiters degrade to availability (fail-open) rather
  than crashing request paths when Redis is down.

## Injection & input safety

- All `$queryRaw` is parameterized tagged-template SQL; no `Unsafe` variants.
- Every external input (body/query/params/file metadata/socket payloads/job
  payloads) is Zod-validated; pagination capped server-side; bounded JSON
  bodies (1mb).
- User content is stored and rendered as **text** (React escaping), never raw
  HTML; `sanitizePlainText` strips angle brackets/active vectors pre-storage;
  `dangerouslySetInnerHTML` is unused.

## Uploads

- Allowlist MIME (jpeg/png/webp) **plus magic-byte signature verification**,
  5 MB cap, generated keys (`avatars/<user>/<uuid>.<ext>`), no original
  filenames, no path traversal. S3: private buckets, presigned download URLs
  (1h), least-privilege IAM; PostgreSQL stores keys, never bytes or URLs.

## WebSocket / competition integrity

- Identity from authenticated handshake; rooms `user:<id>` /
  `challenge:<id>` joined only after authorization. Client can never set
  correctness, score, time, result, rating, winner, or rank — server computes
  all; duplicate/late/replayed answers and timer manipulation are rejected
  server-side; result processing is idempotent.

## HTTP hardening

- Helmet (noSniff, no-referrer, CORP cross-origin for public assets; CSP
  intentionally off — API serves JSON/bytes only), CORS allowlist,
  `trust proxy` for correct IP/cookies behind the ALB, HSTS at the
  edge (CloudFront/ALB) in production.

## Admin & audit

- Area-gated routes, paginated reads, append-only `AdminAuditLog` (actor,
  action, target, before/after, reason, IP). Failed BullMQ jobs inspectable
  but payloads truncated. Points ledger, rating/submission/result histories
  are immutable from ordinary user APIs.
- Suspend/ban (`PATCH /admin/users/:id/status`) revokes all live sessions
  immediately (verified live); the guard's `isActive` check enforces
  deactivation even if Redis is unreachable. Security incident path:
  `docs/incident-response.md`; rate-limit forensics: `GET /admin/rate-limits`
  - `docs/runbooks.md`.

## Privacy

- Private profiles 404 for strangers; explicit selects keep hashes, review
  notes, and moderation data server-side. Retention schedule in
  `docs/privacy-retention.md`; AI telemetry stores features/latency/tokens,
  never prompts or profiles.

## Dependency vulnerabilities (audited 2026-09-17, `pnpm audit --prod`)

Fixed via `pnpm.overrides` in the root `package.json` (same-major/minor
only, re-verified with unit + e2e + live upload/smoke afterward):

- `multer@2.0.2 → 2.4.0` (DoS advisories, runtime upload path) — verified
  with a live avatar upload (201) plus wrong-field rejection (400).
- `postcss@8.4.31 → 8.5.28` (build-time CSS chain) — web build re-verified.
- `lodash@4.17.21 → 4.18.1` (`_.template` injection; app code never imports
  lodash, only `@nestjs/config` internals).

Residual findings with justification (tracked, not suppressed):

- `next@14.2.x` highs + 2 criticals (SSRF/DoS/RCE) — patched only in Next
  15 (major migration with React-19-scale breakage; roadmap item, not a
  blind upgrade). Mitigations in place: Linux containers (the RCE is
  windows-host-specific), layered rate limiting, no Server Actions data
  flow that matches the SSRF shapes, WAF/ALB in front once the production
  edge is provisioned (target architecture in DEPLOYMENT.md §1 — not yet
  provisioned, not in this repo).
- `glob` CLI injection (via `@next/eslint-plugin-next`, lint-time only —
  the CLI is never invoked with `-c` by the app or CI).
- `rollup@3` path traversal (via Sentry's build plugin — build-time only).
- `deepmerge-ts` stack exhaustion (via Prisma CLI chain — migrate-time
  only, never request-reachable).

CI runs the audit on every PR and on every main-branch release build as
an advisory report; secret leaks fail loudly via gitleaks, which stays
blocking. New fixable highs are triaged in this section before release.

## AI / RAG access control

- Provider keys server-side only; models receive only the data the eight
  allowlisted tools return for the requesting user — no SQL, no repos, no
  secrets in tool scope. RAG returns only PUBLISHED canonical problems,
  excluding the query problem itself; unpublished/rejected/private rows are
  filtered in SQL. Contribution AI output is advisory; publication requires a
  human. Per-user daily budgets + per-route throttles bound cost; failures
  fall back deterministically and never block core flows.
