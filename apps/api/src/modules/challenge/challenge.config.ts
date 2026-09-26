import type { ChallengeConfigDto } from '@apteez/types';

export const CHALLENGE_COUNTDOWN_SECONDS = 5;
export const CHALLENGE_RECONNECT_GRACE_SECONDS = 45;
export const MATCHMAKING_STALE_SECONDS = 120;
/** How often the background sweep re-checks matchmaking + live challenges. */
export const CHALLENGE_SWEEP_INTERVAL_SECONDS = 15;
/** Extra headroom kept on ephemeral live keys beyond duration + grace. */
export const CHALLENGE_LIVE_RETENTION_BUFFER_SECONDS = 600;
/** Questions created up front per match; more are appended endlessly. */
export const CHALLENGE_INITIAL_QUESTION_BATCH = 8;
/** Top-up trigger: refill when fewer than this many unanswered remain. */
export const CHALLENGE_TOPUP_BUFFER = 3;

const DEFAULTS = {
  minReadingSeconds: 3,
  initialRatingWindow: 150,
  ratingWindowGrowthPerSecond: 4,
  maxRatingWindow: 600,
} as const;

/** Match length in seconds from the env-configured minutes. */
export function resolveChallengeDurationSeconds(durationMinutes: number): number {
  const minutes = Math.min(10, Math.max(1, Math.floor(durationMinutes)));
  return minutes * 60;
}

export function buildChallengeConfig(domainSlug: string, durationSeconds: number): ChallengeConfigDto {
  return {
    domainSlug,
    countdownSeconds: CHALLENGE_COUNTDOWN_SECONDS,
    reconnectGraceSeconds: CHALLENGE_RECONNECT_GRACE_SECONDS,
    questionCount: CHALLENGE_INITIAL_QUESTION_BATCH,
    durationSeconds,
    ...DEFAULTS,
  };
}

/**
 * TTL for a challenge's ephemeral Redis state. Must always outlive the real
 * match (duration + countdown + reconnect grace) so a legitimate long game is
 * never evicted mid-play, plus a buffer for post-completion cleanup reads.
 */
export function liveRetentionSeconds(
  durationSeconds: number,
  countdownSeconds = CHALLENGE_COUNTDOWN_SECONDS,
): number {
  return (
    durationSeconds +
    countdownSeconds +
    CHALLENGE_RECONNECT_GRACE_SECONDS * 2 +
    CHALLENGE_LIVE_RETENTION_BUFFER_SECONDS
  );
}

export const LIVE_RETENTION_SECONDS = liveRetentionSeconds(
  resolveChallengeDurationSeconds(10),
);
