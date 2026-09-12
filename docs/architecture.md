# ApteeZ architecture (foundation)

This note captures the structural decisions of Prompts 01–03 so later
prompts extend the system without rewrites.

## Data ownership

- **PostgreSQL is the system of record.** Users, roles, permissions and (soon)
  questions, submissions, contests and reviews live here via Prisma.
- **Redis is ephemeral.** Queues, live challenge/contest state, locks, rate
  limits and caches only. Nothing in Redis must be unrecoverable.
- **Object storage is abstracted** behind `StorageService`. Local filesystem
  for development, any S3-compatible store in AWS-compatible environments.
  The frontend never constructs storage URLs — it only uses URLs minted by
  the API.

## Authority

The NestJS backend is authoritative for scores, timers, challenge results,
contest state, ratings, rewards and permissions. Guards (`RolesGuard`,
`PermissionsGuard`) re-check every request server-side.

## Contracts

- Every API response uses the envelope in `@apteez/types`: success responses
  are `{ success: true, data }`, errors are `{ success: false, error: {
statusCode, code, message, details? }, requestId }`.
- Zod is the single validation library. Shared schemas live in
  `@apteez/validation`; the API validates requests with `ZodValidationPipe`.
- API versioning is URI-based (`/api/v1/...`).

## Module boundaries

Sixteen NestJS product modules are registered in `AppModule` as empty
boundaries. Later prompts implement them independently. The rating engine
stays inside `LeaderboardModule`; the contribution lifecycle
(`PENDING → UNDER_REVIEW → APPROVED | REJECTED`) stays inside
`ContributionModule` with review tooling in `AdminModule`.

## Authentication & authorization (Prompt 03)

- **Sessions**: opaque random tokens; only their SHA-256 hashes live in
  Redis (`sess:<hash>` → `{ userId, via, ip, userAgent }`), so a Redis dump
  cannot impersonate anyone. The client holds an HTTP-only `SameSite=Lax`
  cookie (web) or uses `Authorization: Bearer` (future mobile). Sliding TTL
  refresh; `revoke`/`revokeAllForUser` take effect immediately; logout is
  idempotent.
- **Identity**: `User` is the account; `AuthIdentity`
  (`provider` + `providerUserId`, unique together) is the OAuth link — never
  email alone. Google sign-in links by identity first, then verified email,
  else provisions a new user. CITEXT columns make email/username
  uniqueness case-insensitive in the database.
- **RBAC**: database-backed. `SessionAuthGuard` (global) resolves the
  session and loads roles + `action:resource` permissions; `RolesGuard` and
  `PermissionsGuard` enforce `@Roles(...)` / `@Permissions(...)`.
  Registration always assigns only the `user` role — role changes are
  administrative operations. Frontend role data is visibility only.
- **Abuse protection**: Redis-backed `@nestjs/throttler` storage (two
  named limiters: default + stricter `auth`), a per-account failed-login
  budget (429 on exhaustion), and an Origin/Referer allowlist check
  (`OriginCheckMiddleware`) as CSRF defense for cookie-authenticated
  mutations. Enumeration-safe errors: unknown account and wrong password
  are indistinguishable (`INVALID_CREDENTIALS`); `ACCOUNT_EXISTS` never says
  which field collided.
- **Audit**: `auth.register`, `auth.login` (success/failure),
  `auth.login disabled`, `auth.logout`, `auth.oauth.*` events are logged
  via AppLogger with userId/email/ip — passwords, tokens and client secrets
  are never logged. A dedicated audit table can subscribe to the same
  events later.
