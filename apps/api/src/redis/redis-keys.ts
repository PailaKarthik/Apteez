/**
 * Central registry of every Redis key the application uses. Services must
 * never build raw key strings — a typo in one place silently orphans state,
 * and a collision in another corrupts it. All keys share the `apteez:`
 * namespace so a shared Redis instance stays inspectable and safe to scan.
 *
 * Key families:
 *   sess ......... opaque server-side sessions (auth)
 *   auth ......... login-attempt budgets, OAuth state
 *   matchmaking .. ephemeral queue + per-user pointer + per-domain lock
 *   challenge .... live metadata, connection markers, idempotency sets
 *   contest ...... live status broadcast markers + finalize locks
 *   lock ......... generic distributed locks
 *   idem ......... generic one-shot idempotency markers
 *   ws .......... websocket event rate-limit counters
 */
export const REDIS_NAMESPACE = 'apteez';

export const redisKeys = {
  session: (tokenHash: string): string => `${REDIS_NAMESPACE}:sess:${tokenHash}`,

  sessionUserIndex: (userId: string): string => `${REDIS_NAMESPACE}:sess:user:${userId}`,

  loginAttempt: (emailHash: string): string => `${REDIS_NAMESPACE}:auth:login-attempt:${emailHash}`,

  oauthState: (state: string): string => `${REDIS_NAMESPACE}:auth:oauth-state:${state}`,

  matchmakingQueue: (domainSlug: string): string =>
    `${REDIS_NAMESPACE}:matchmaking:queue:${domainSlug}`,

  matchmakingUser: (userId: string): string => `${REDIS_NAMESPACE}:matchmaking:user:${userId}`,

  matchmakingLock: (domainSlug: string): string =>
    `${REDIS_NAMESPACE}:matchmaking:lock:${domainSlug}`,

  /** Pattern for SCAN-based sweeps (never used with KEYS in production). */
  matchmakingUserPattern: (): string => `${REDIS_NAMESPACE}:matchmaking:user:*`,

  challengeLive: (challengeId: string): string =>
    `${REDIS_NAMESPACE}:challenge:${challengeId}:live`,

  challengeConn: (challengeId: string, userId: string): string =>
    `${REDIS_NAMESPACE}:challenge:${challengeId}:conn:${userId}`,

  challengeDisc: (challengeId: string, userId: string): string =>
    `${REDIS_NAMESPACE}:challenge:${challengeId}:disc:${userId}`,

  /** Reverse pointer: which live challenge a user is currently in. */
  challengeActiveUser: (userId: string): string =>
    `${REDIS_NAMESPACE}:challenge:active-user:${userId}`,

  challengeActiveUserPattern: (): string => `${REDIS_NAMESPACE}:challenge:active-user:*`,

  challengeLivePattern: (): string => `${REDIS_NAMESPACE}:challenge:*:live`,

  /** Positions a player has answered — idempotency for duplicate events. */
  challengeAnswered: (challengeId: string, userId: string): string =>
    `${REDIS_NAMESPACE}:challenge:${challengeId}:answered:${userId}`,

  /** Single-writer guard around challenge finalization. */
  challengeFinalizeLock: (challengeId: string): string =>
    `${REDIS_NAMESPACE}:challenge:${challengeId}:finalize-lock`,

  /** Single-writer guard around contest finalization per participant. */
  contestFinalizeLock: (contestId: string, userId: string): string =>
    `${REDIS_NAMESPACE}:contest:${contestId}:finalize:${userId}`,

  /** Single-writer guard around whole-contest finalization (ranks/ratings). */
  contestCloseLock: (contestId: string): string =>
    `${REDIS_NAMESPACE}:contest:${contestId}:close-lock`,

  lock: (name: string): string => `${REDIS_NAMESPACE}:lock:${name}`,

  idempotency: (key: string): string => `${REDIS_NAMESPACE}:idem:${key}`,

  websocketRate: (userId: string, event: string): string =>
    `${REDIS_NAMESPACE}:ws:rate:${userId}:${event}`,
} as const;
