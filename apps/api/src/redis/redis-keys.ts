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
 *   search ...... autocomplete, trending, filter metadata (short TTL)
 *   recs ........ personalized recommendation snapshots (short TTL, per-user)
 */
export const REDIS_NAMESPACE = 'apteez';

export const redisKeys = {
  session: (tokenHash: string): string => `${REDIS_NAMESPACE}:sess:${tokenHash}`,

  sessionUserIndex: (userId: string): string => `${REDIS_NAMESPACE}:sess:user:${userId}`,

  loginAttempt: (emailHash: string): string => `${REDIS_NAMESPACE}:auth:login-attempt:${emailHash}`,

  oauthState: (state: string): string => `${REDIS_NAMESPACE}:auth:oauth-state:${state}`,

  /** Hashed email-OTP record for a user (10-min TTL, few verify attempts). */
  emailOtp: (userId: string): string => `${REDIS_NAMESPACE}:auth:email-otp:${userId}`,

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

  /** Single-writer guard around event participant finalization. */
  eventFinalizeLock: (eventId: string, userId: string): string =>
    `${REDIS_NAMESPACE}:event:${eventId}:finalize:${userId}`,

  /** Single-writer guard around whole-event rank recomputation. */
  eventCloseLock: (eventId: string): string => `${REDIS_NAMESPACE}:event:${eventId}:close-lock`,

  /** Single-writer guard around event registration (capacity backstop). */
  eventRegisterLock: (eventId: string): string =>
    `${REDIS_NAMESPACE}:event:${eventId}:register-lock`,

  /** Cached discovery page (short TTL, invalidated on writes). */
  eventListCache: (hash: string): string => `${REDIS_NAMESPACE}:event:list:${hash}`,

  /** Cached event detail (short TTL, invalidated on writes). */
  eventDetailCache: (eventId: string): string => `${REDIS_NAMESPACE}:event:detail:${eventId}`,

  /** Live countdown / participant-count metadata (ephemeral). */
  eventLive: (eventId: string): string => `${REDIS_NAMESPACE}:event:${eventId}:live`,

  /** Cached autocomplete payload for a normalized query (shared, non-personal). */
  searchSuggest: (queryHash: string): string => `${REDIS_NAMESPACE}:search:suggest:${queryHash}`,

  /** Cached trending snapshot (shared, computed from unique-user signals). */
  searchTrending: (): string => `${REDIS_NAMESPACE}:search:trending`,

  /** Cached problem filter metadata (shared). */
  searchFilters: (): string => `${REDIS_NAMESPACE}:search:filters`,

  /** Personalized recommendation snapshot; always namespaced per user. */
  recommendations: (userId: string, kind: string): string =>
    `${REDIS_NAMESPACE}:recs:${userId}:${kind}`,

  /** Cached admin overview snapshot (short TTL, counts only). */
  adminOverview: (): string => `${REDIS_NAMESPACE}:admin:overview`,

  /** Per-user daily AI budget counter for one feature (UTC day TTL). */
  aiBudget: (userId: string, feature: string): string =>
    `${REDIS_NAMESPACE}:ai:budget:${userId}:${feature}`,

  /** Cached deterministic coach summary (short TTL, per user). */
  aiCoachCache: (userId: string): string => `${REDIS_NAMESPACE}:ai:coach:${userId}`,

  /** Cached similar-problem response (shared per problem, short TTL). */
  aiSimilarCache: (problemId: string): string => `${REDIS_NAMESPACE}:ai:similar:${problemId}`,
} as const;
