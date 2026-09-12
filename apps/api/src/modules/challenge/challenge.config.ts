import type { ChallengeConfigDto } from '@apteez/types';

export const CHALLENGE_COUNTDOWN_SECONDS = 5;
export const CHALLENGE_RECONNECT_GRACE_SECONDS = 45;
export const MATCHMAKING_STALE_SECONDS = 120;
/** How often the background sweep re-checks matchmaking + live challenges. */
export const CHALLENGE_SWEEP_INTERVAL_SECONDS = 15;
/** Extra headroom kept on ephemeral live keys beyond duration + grace. */
export const CHALLENGE_LIVE_RETENTION_BUFFER_SECONDS = 600;

const DEFAULT_CONFIG = {
  questionCount: 8,
  durationSeconds: 300,
  minReadingSeconds: 3,
  initialRatingWindow: 150,
  ratingWindowGrowthPerSecond: 4,
  maxRatingWindow: 600,
} as const;

export function buildChallengeConfig(domainSlug: string): ChallengeConfigDto {
  return {
    domainSlug,
    countdownSeconds: CHALLENGE_COUNTDOWN_SECONDS,
    reconnectGraceSeconds: CHALLENGE_RECONNECT_GRACE_SECONDS,
    ...DEFAULT_CONFIG,
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

export const LIVE_RETENTION_SECONDS = liveRetentionSeconds(DEFAULT_CONFIG.durationSeconds);
