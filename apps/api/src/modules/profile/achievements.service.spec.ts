import type { PrismaService } from '@apteez/database';
import { AchievementsService } from './achievements.service';

function createService() {
  const prisma = {
    achievement: { findMany: jest.fn().mockResolvedValue([]) },
    userAchievement: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      count: jest.fn(),
    },
    challengeRating: { findMany: jest.fn().mockResolvedValue([]) },
    challengeRatingHistory: { count: jest.fn().mockResolvedValue(0) },
    contestResult: { findFirst: jest.fn().mockResolvedValue(null) },
    contestParticipant: { count: jest.fn().mockResolvedValue(0) },
    eventParticipant: { count: jest.fn().mockResolvedValue(0) },
    contribution: { count: jest.fn().mockResolvedValue(0) },
  } as unknown as PrismaService;
  const points = { awardOnce: jest.fn().mockResolvedValue({ awarded: true, balance: 10 }) };
  const activity = { streak: jest.fn().mockResolvedValue({ current: 0, longest: 0 }) };
  const performance = { overall: jest.fn().mockResolvedValue({ distinctSolved: 0 }) };
  const logger = { warn: jest.fn() };
  const service = new AchievementsService(
    prisma,
    points as never,
    activity as never,
    performance as never,
    logger as never,
  );
  return { service, prisma, points };
}

describe('AchievementsService rules', () => {
  it('maps every seeded key to its signal threshold', () => {
    const { service } = createService();
    const base = {
      distinctSolved: 0,
      bestChallengeRating: null,
      longestStreak: 0,
      challengeWins: 0,
      bestContestRank: null,
      contestsEntered: 0,
      eventsJoined: 0,
      contributionsApproved: 0,
    };
    expect(service.isEligible('first-solve', { ...base, distinctSolved: 1 })).toBe(true);
    expect(service.isEligible('solve-100', { ...base, distinctSolved: 99 })).toBe(false);
    expect(service.isEligible('solve-100', { ...base, distinctSolved: 100 })).toBe(true);
    expect(service.isEligible('rating-1500', { ...base, bestChallengeRating: 1500 })).toBe(true);
    expect(service.isEligible('streak-30', { ...base, longestStreak: 29 })).toBe(false);
    expect(service.isEligible('streak-30', { ...base, longestStreak: 30 })).toBe(true);
    expect(service.isEligible('challenge-winner', { ...base, challengeWins: 1 })).toBe(true);
    expect(service.isEligible('contest-top-10', { ...base, bestContestRank: 11 })).toBe(false);
    expect(service.isEligible('contest-top-10', { ...base, bestContestRank: 10 })).toBe(true);
    expect(service.isEligible('first-contest', { ...base, contestsEntered: 1 })).toBe(true);
    expect(service.isEligible('first-event', { ...base, eventsJoined: 1 })).toBe(true);
    expect(service.isEligible('contribution-approved', { ...base, contributionsApproved: 1 })).toBe(
      true,
    );
    expect(service.isEligible('unknown-key', base)).toBe(false);
  });

  it('skips owned achievements and never double-awards on unique races', async () => {
    const { service, prisma, points } = createService();
    (prisma.achievement.findMany as jest.Mock).mockResolvedValue([
      { id: 'a1', key: 'first-solve', points: 10 },
    ]);
    (prisma.userAchievement.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.eventParticipant.count as jest.Mock).mockResolvedValue(0);
    // Force eligibility through the performance mock.
    (
      service as unknown as { performance: { overall: jest.Mock } }
    ).performance.overall.mockResolvedValue({
      distinctSolved: 5,
    });
    const created = await service.evaluate('u1');
    expect(created).toEqual(['first-solve']);
    expect(points.awardOnce).toHaveBeenCalledWith({
      userId: 'u1',
      amount: 10,
      reason: 'achievement:unlock',
      referenceId: 'first-solve',
    });

    // A retried evaluation with a P2002 race resolves to no new unlock.
    (prisma.userAchievement.create as jest.Mock).mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    await expect(service.evaluate('u1')).resolves.toEqual([]);
  });
});
