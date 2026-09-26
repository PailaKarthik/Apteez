import { ActivityService } from './activity.service';
import { PerformanceService } from './performance.service';

/**
 * Regression: a points-only day (login/onboarding bonus, zero activity)
 * must not seal the watermark — later submissions the same day have to be
 * bucketed, or streaks/heatmaps freeze at 0 forever.
 */
describe('ActivityService.ensureFresh watermark', () => {
  function setup(existingDaily: Array<{ date: Date; totalActivityCount: number }>) {
    const upserts: Array<{ where: unknown; update: unknown; create: unknown }> = [];
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }) },
      userActivityDaily: {
        // Mirrors the service: watermark reads the latest ACTIVE day only.
        findFirst: jest.fn().mockImplementation(async (args: { where: { totalActivityCount?: { gt: number } } }) => {
          const pool = args.where.totalActivityCount
            ? existingDaily.filter((row) => row.totalActivityCount > 0)
            : existingDaily;
          const sorted = [...pool].sort((a, b) => b.date.getTime() - a.date.getTime());
          return sorted[0] ?? null;
        }),
      },
      submission: {
        findMany: jest.fn().mockResolvedValue([
          { submittedAt: new Date('2026-09-21T07:37:46.567Z'), isCorrect: true },
        ]),
      },
      challengeRatingHistory: { findMany: jest.fn().mockResolvedValue([]) },
      contestResult: { findMany: jest.fn().mockResolvedValue([]) },
      eventResult: { findMany: jest.fn().mockResolvedValue([]) },
      userLearningProgress: { findMany: jest.fn().mockResolvedValue([]) },
      pointTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
    };
    // userActivityDaily.upsert records create/update payloads for assertions.
    (prisma as Record<string, unknown>).userActivityDailyUpsertTarget = upserts;
    const svcPrisma = {
      ...prisma,
      userActivityDaily: {
        ...prisma.userActivityDaily,
        upsert: jest.fn().mockImplementation(async (args: { create: unknown }) => {
          upserts.push(args as { where: unknown; update: unknown; create: unknown });
          return args.create;
        }),
      },
    };
    const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const performance = {} as PerformanceService;
    const service = new ActivityService(svcPrisma as never, performance, logger as never);
    return { service, prisma: svcPrisma, upserts };
  }

  it('recounts a zero-activity day instead of sealing it off', async () => {
    // A points-only login bonus earlier today wrote a zero-total row.
    const { service, prisma, upserts } = setup([
      { date: new Date('2026-09-21T00:00:00.000Z'), totalActivityCount: 0 },
    ]);
    await service.ensureFresh('user-1');
    // The submissions rescan must have run (not early-returned).
    expect(prisma.submission.findMany).toHaveBeenCalled();
    const today = upserts.find(
      (op) =>
        (op.create as { date: Date }).date.toISOString().slice(0, 10) === '2026-09-21',
    );
    expect(today).toBeDefined();
    expect(today?.create).toMatchObject({ problemsAttempted: 1, problemsSolved: 1 });
  });

  it('still skips rescans when the watermark already covers today', async () => {
    const { service, prisma } = setup([
      { date: new Date('2026-09-21T00:00:00.000Z'), totalActivityCount: 5 },
    ]);
    // Control the clock to 2026-09-21 so fromDate lands tomorrow.
    const realNow = Date.now;
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-21T12:00:00.000Z').getTime());
    try {
      await service.ensureFresh('user-1');
    } finally {
      (Date.now as jest.Mock).mockRestore?.();
      Date.now = realNow;
    }
    expect(prisma.submission.findMany).not.toHaveBeenCalled();
  });
});
