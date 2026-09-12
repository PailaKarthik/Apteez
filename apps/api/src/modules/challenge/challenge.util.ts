import type { ChallengeStatus } from '@apteez/types';

const ALLOWED_TRANSITIONS: Record<ChallengeStatus, readonly ChallengeStatus[]> = {
  MATCHMAKING: ['MATCHED', 'CANCELLED', 'EXPIRED'],
  MATCHED: ['COUNTDOWN', 'CANCELLED', 'EXPIRED', 'ABANDONED'],
  COUNTDOWN: ['LIVE', 'CANCELLED', 'ABANDONED', 'EXPIRED'],
  LIVE: ['COMPLETED', 'ABANDONED', 'EXPIRED'],
  COMPLETED: [],
  CANCELLED: [],
  ABANDONED: [],
  EXPIRED: [],
};

export function canTransition(from: ChallengeStatus, to: ChallengeStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminal(status: ChallengeStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

export function computeScore(correct: number, wrong: number): number {
  return correct - wrong;
}

export function buildScoreboard(
  correct: number,
  wrong: number,
  total: number,
): { correct: number; wrong: number; unanswered: number; score: number } {
  const unanswered = Math.max(0, total - correct - wrong);
  return { correct, wrong, unanswered, score: computeScore(correct, wrong) };
}
