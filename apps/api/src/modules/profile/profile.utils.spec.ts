import {
  accuracyOf,
  averageOf,
  computeStreak,
  dayKeyInTimezone,
  scoreWeakArea,
  shiftDayKey,
} from './profile.utils';

describe('dayKeyInTimezone', () => {
  it('buckets the same instant into different days across timezones', () => {
    // 2026-03-01 02:30 IST == 2026-02-28 21:00 UTC.
    const instant = new Date('2026-02-28T21:00:00.000Z');
    expect(dayKeyInTimezone(instant, 'UTC')).toBe('2026-02-28');
    expect(dayKeyInTimezone(instant, 'Asia/Kolkata')).toBe('2026-03-01');
  });

  it('defaults to UTC and shifts keys across month boundaries', () => {
    expect(dayKeyInTimezone(new Date('2026-01-01T00:30:00.000Z'))).toBe('2026-01-01');
    expect(shiftDayKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDayKey('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('computeStreak', () => {
  it('starts a streak on the first active day', () => {
    expect(computeStreak(['2026-05-01'], '2026-05-01')).toEqual({
      current: 1,
      longest: 1,
      lastActiveDate: '2026-05-01',
      activeToday: true,
    });
  });

  it('counts consecutive days and keeps the longest run', () => {
    const days = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-05', '2026-05-06'];
    expect(computeStreak(days, '2026-05-06')).toEqual({
      current: 2,
      longest: 3,
      lastActiveDate: '2026-05-06',
      activeToday: true,
    });
  });

  it('breaks the current streak after a missed day but preserves longest', () => {
    const days = ['2026-05-01', '2026-05-02', '2026-05-03', '2026-05-05'];
    expect(computeStreak(days, '2026-05-07')).toEqual({
      current: 0,
      longest: 3,
      lastActiveDate: '2026-05-05',
      activeToday: false,
    });
  });

  it('keeps the streak alive when yesterday was active and today is open', () => {
    expect(computeStreak(['2026-05-05', '2026-05-06'], '2026-05-07')).toMatchObject({
      current: 2,
      activeToday: false,
    });
  });

  it('counts repeated same-day activity as one day', () => {
    expect(computeStreak(['2026-05-06', '2026-05-06', '2026-05-06'], '2026-05-06')).toMatchObject({
      current: 1,
      longest: 1,
    });
  });

  it('handles an empty history', () => {
    expect(computeStreak([], '2026-05-06')).toEqual({
      current: 0,
      longest: 0,
      lastActiveDate: null,
      activeToday: false,
    });
  });
});

describe('scoreWeakArea', () => {
  it('never labels below-threshold topics as weak', () => {
    expect(
      scoreWeakArea({
        topicSlug: 't',
        topicName: 'T',
        domainSlug: 'd',
        domainName: 'D',
        attempts: 3,
        accuracy: 0.1,
        avgTimeSeconds: 999,
        recentTrend: -50,
        globalAvgTimeSeconds: 60,
      }).eligible,
    ).toBe(false);
  });

  it('rates sustained low accuracy as high severity with a reason', () => {
    const scored = scoreWeakArea({
      topicSlug: 't',
      topicName: 'T',
      domainSlug: 'd',
      domainName: 'D',
      attempts: 20,
      accuracy: 0.4,
      avgTimeSeconds: 60,
      recentTrend: -15,
      globalAvgTimeSeconds: 60,
    });
    expect(scored).toMatchObject({ eligible: true, severity: 'high' });
    expect(scored.reason.length).toBeGreaterThan(10);
  });

  it('combines moderate accuracy with slowness into medium severity', () => {
    const scored = scoreWeakArea({
      topicSlug: 't',
      topicName: 'T',
      domainSlug: 'd',
      domainName: 'D',
      attempts: 12,
      accuracy: 0.6,
      avgTimeSeconds: 200,
      recentTrend: 0,
      globalAvgTimeSeconds: 100,
    });
    expect(scored).toMatchObject({ eligible: true, severity: 'medium' });
  });

  it('leaves strong topics ineligible', () => {
    expect(
      scoreWeakArea({
        topicSlug: 't',
        topicName: 'T',
        domainSlug: 'd',
        domainName: 'D',
        attempts: 30,
        accuracy: 0.9,
        avgTimeSeconds: 45,
        recentTrend: 5,
        globalAvgTimeSeconds: 60,
      }).eligible,
    ).toBe(false);
  });
});

describe('accuracyOf / averageOf', () => {
  it('returns null without attempts and rounds otherwise', () => {
    expect(accuracyOf(0, 0)).toBeNull();
    expect(accuracyOf(1, 3)).toBe(33.3);
    expect(accuracyOf(2, 2)).toBe(100);
  });

  it('ignores missing durations', () => {
    expect(averageOf([])).toBeNull();
    expect(averageOf([null, undefined])).toBeNull();
    expect(averageOf([30, 90, null])).toBe(60);
  });
});
