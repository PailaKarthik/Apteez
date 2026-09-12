/** Queue names and job identifiers — one source of truth for producers and consumers. */
export const CHALLENGE_QUEUE = 'challenge-jobs';

export const CHALLENGE_JOBS = {
  /** Promote a challenge COUNTDOWN → LIVE once its server start time arrives. */
  activate: 'challenge.activate',
  /** Finalize a challenge whose server end time has passed. */
  expire: 'challenge.expire',
  /** Sweep stale matchmaking entries and retry left-over matches. */
  matchmakingSweep: 'matchmaking.sweep',
  /** Remove expired live-state keys that outlived their challenge. */
  liveStateCleanup: 'challenge.live-state-cleanup',
  /** Apply ratings for a finalized challenge (idempotent). */
  ratingUpdate: 'challenge-rating-update',
} as const;

export type ChallengeJobName = (typeof CHALLENGE_JOBS)[keyof typeof CHALLENGE_JOBS];

/** Deterministic job ids make repeated scheduling idempotent. */
export function activateJobId(challengeId: string): string {
  return `activate_${challengeId}`;
}

export function expireJobId(challengeId: string): string {
  return `expire_${challengeId}`;
}

/** Deterministic job id — a duplicate rating enqueue collapses into one job. */
export function ratingJobId(challengeId: string): string {
  return `rating_${challengeId}`;
}
