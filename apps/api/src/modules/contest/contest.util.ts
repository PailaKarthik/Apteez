import type { ContestStatus } from '@apteez/types';

/**
 * Server-owned contest lifecycle transitions. Clients can never move a
 * contest; only organizer/admin flows (a later prompt) may call transitions,
 * and participation guards always re-check the stored status + timestamps.
 */
const ALLOWED_TRANSITIONS: Record<ContestStatus, readonly ContestStatus[]> = {
  DRAFT: ['PUBLISHED', 'REGISTRATION_OPEN', 'CANCELLED', 'ARCHIVED'],
  PUBLISHED: ['REGISTRATION_OPEN', 'LIVE', 'CANCELLED', 'ARCHIVED'],
  REGISTRATION_OPEN: ['LIVE', 'PUBLISHED', 'CANCELLED', 'ARCHIVED'],
  LIVE: ['ENDED', 'CANCELLED'],
  ENDED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionContest(from: ContestStatus, to: ContestStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isContestTerminal(status: ContestStatus): boolean {
  return (ALLOWED_TRANSITIONS[status] ?? []).length === 0;
}

/** Contests a participant may interact with (enter/answer/submit). */
export function isParticipableStatus(status: ContestStatus): boolean {
  return status === 'REGISTRATION_OPEN' || status === 'LIVE' || status === 'PUBLISHED';
}

/** Registration is only accepted while the window is explicitly open. */
export function isRegistrationStatus(status: ContestStatus): boolean {
  return status === 'REGISTRATION_OPEN' || status === 'PUBLISHED' || status === 'LIVE';
}

/** Default scoring model: solved count; wrong answers never subtract. */
export function contestScoreFor(solvedCount: number): number {
  return Math.max(0, solvedCount);
}

/**
 * Deterministic ranking comparator: solved DESC, completion time ASC,
 * userId ASC as the final stable tiebreak.
 */
export function compareContestResults(
  a: { solvedCount: number; score: number; completionSeconds: number; userId: string },
  b: { solvedCount: number; score: number; completionSeconds: number; userId: string },
): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  if (a.solvedCount !== b.solvedCount) {
    return b.solvedCount - a.solvedCount;
  }
  if (a.completionSeconds !== b.completionSeconds) {
    return a.completionSeconds - b.completionSeconds;
  }
  return a.userId.localeCompare(b.userId);
}
