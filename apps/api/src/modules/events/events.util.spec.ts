import {
  canTransitionEvent,
  compareEventResults,
  isRegistrationStatus,
  slugifyEventTitle,
} from './events.util';

describe('event lifecycle', () => {
  it('allows the happy path Draft → Published → Registration Open → Live → Completed → Archived', () => {
    expect(canTransitionEvent('DRAFT', 'PUBLISHED')).toBe(true);
    expect(canTransitionEvent('PUBLISHED', 'REGISTRATION_OPEN')).toBe(true);
    expect(canTransitionEvent('REGISTRATION_OPEN', 'LIVE')).toBe(true);
    expect(canTransitionEvent('LIVE', 'COMPLETED')).toBe(true);
    expect(canTransitionEvent('COMPLETED', 'ARCHIVED')).toBe(true);
  });

  it('supports registration open/close cycling and cancellation', () => {
    expect(canTransitionEvent('REGISTRATION_OPEN', 'REGISTRATION_CLOSED')).toBe(true);
    expect(canTransitionEvent('REGISTRATION_CLOSED', 'REGISTRATION_OPEN')).toBe(true);
    expect(canTransitionEvent('REGISTRATION_OPEN', 'CANCELLED')).toBe(true);
    expect(canTransitionEvent('PUBLISHED', 'CANCELLED')).toBe(true);
    expect(canTransitionEvent('CANCELLED', 'ARCHIVED')).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransitionEvent('DRAFT', 'LIVE')).toBe(false);
    expect(canTransitionEvent('DRAFT', 'COMPLETED')).toBe(false);
    expect(canTransitionEvent('LIVE', 'REGISTRATION_OPEN')).toBe(false);
    expect(canTransitionEvent('COMPLETED', 'LIVE')).toBe(false);
    expect(canTransitionEvent('ARCHIVED', 'PUBLISHED')).toBe(false);
    expect(canTransitionEvent('CANCELLED', 'LIVE')).toBe(false);
  });

  it('accepts registration only in REGISTRATION_OPEN', () => {
    expect(isRegistrationStatus('REGISTRATION_OPEN')).toBe(true);
    expect(isRegistrationStatus('PUBLISHED')).toBe(false);
    expect(isRegistrationStatus('REGISTRATION_CLOSED')).toBe(false);
    expect(isRegistrationStatus('LIVE')).toBe(false);
  });
});

describe('event ranking', () => {
  it('orders by score, then correct count, then time, then userId', () => {
    const rows = [
      { score: 5, correctCount: 5, completionSeconds: 300, userId: 'b' },
      { score: 8, correctCount: 8, completionSeconds: 900, userId: 'c' },
      { score: 8, correctCount: 7, completionSeconds: 100, userId: 'a' },
      { score: 8, correctCount: 8, completionSeconds: 100, userId: 'z' },
      { score: 8, correctCount: 8, completionSeconds: 100, userId: 'a' },
    ];
    const sorted = [...rows].sort(compareEventResults);
    expect(sorted.map((r) => r.userId)).toEqual(['a', 'z', 'c', 'a', 'b']);
    expect(sorted[0]).toMatchObject({ score: 8, correctCount: 8, completionSeconds: 100 });
  });
});

describe('event slugs', () => {
  it('slugifies titles and falls back for degenerate input', () => {
    expect(slugifyEventTitle('Monsoon Aptitude Marathon 2026!')).toBe(
      'monsoon-aptitude-marathon-2026',
    );
    expect(slugifyEventTitle('!!!')).toMatch(/^event-/);
  });
});
