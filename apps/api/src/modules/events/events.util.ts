import type { EventStatus } from '@apteez/types';
import { EventValidationError } from './events.errors';

/**
 * Server-owned event lifecycle. Clients can never move an event; organizer
 * and admin flows call `transition`, and every participation guard re-checks
 * the stored status + timestamps.
 *
 * Draft → Published → Registration Open → Registration Closed → Live →
 * Completed → Archived, with Cancelled reachable from any pre-terminal state.
 */
const ALLOWED_TRANSITIONS: Record<EventStatus, readonly EventStatus[]> = {
  DRAFT: ['PUBLISHED', 'REGISTRATION_OPEN', 'CANCELLED', 'ARCHIVED'],
  PUBLISHED: ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE', 'CANCELLED', 'ARCHIVED'],
  REGISTRATION_OPEN: ['REGISTRATION_CLOSED', 'LIVE', 'PUBLISHED', 'CANCELLED'],
  REGISTRATION_CLOSED: ['REGISTRATION_OPEN', 'LIVE', 'CANCELLED', 'ARCHIVED'],
  LIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

export function canTransitionEvent(from: EventStatus, to: EventStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isEventTerminal(status: EventStatus): boolean {
  return (ALLOWED_TRANSITIONS[status] ?? []).length === 0;
}

/** Events a participant may enter/answer/submit in. */
export function isParticipableStatus(status: EventStatus): boolean {
  return status === 'LIVE' || status === 'REGISTRATION_OPEN' || status === 'REGISTRATION_CLOSED';
}

/** Registration is accepted only while explicitly open. */
export function isRegistrationStatus(status: EventStatus): boolean {
  return status === 'REGISTRATION_OPEN';
}

/**
 * Deterministic ranking comparator: score DESC → correctCount DESC →
 * completionSeconds ASC → userId ASC. The final tiebreak is unique per row
 * so ranks are stable across recomputations.
 */
export function compareEventResults(
  a: { score: number; correctCount: number; completionSeconds: number; userId: string },
  b: { score: number; correctCount: number; completionSeconds: number; userId: string },
): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  if (a.correctCount !== b.correctCount) {
    return b.correctCount - a.correctCount;
  }
  if (a.completionSeconds !== b.completionSeconds) {
    return a.completionSeconds - b.completionSeconds;
  }
  return a.userId.localeCompare(b.userId);
}

/** URL-safe slug derivation shared by create flows. */
export function slugifyEventTitle(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return base.length >= 3 ? base : `event-${Date.now().toString(36)}`;
}

/** Reject obvious script-injection payloads; React escapes the rest on render. */
export function assertNoActiveContent(value: string | null | undefined, field: string): void {
  if (!value) {
    return;
  }
  if (/<\s*script|javascript\s*:|on\w+\s*=/i.test(value)) {
    throw new EventValidationError(`Field "${field}" contains disallowed content.`);
  }
}
