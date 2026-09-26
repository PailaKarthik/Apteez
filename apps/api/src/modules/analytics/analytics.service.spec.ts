import { AnalyticsService } from './analytics.service';

function createService() {
  const prisma = {
    analyticsEvent: {
      create: jest.fn().mockResolvedValue({ id: 'e1' }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    user: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    aiUsageLog: { groupBy: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  const service = new AnalyticsService(prisma as never, logger as never);
  return { service, prisma, logger };
}

describe('AnalyticsService', () => {
  it('records known events with bounded metadata', async () => {
    const { service, prisma } = createService();
    await service.record('practice.solved', {
      userId: 'u1',
      metadata: {
        problemId: 'p1',
        password: 'must-be-stripped',
        token: 'must-be-stripped',
        long: 'x'.repeat(500),
      },
      requestId: 'r1',
    });
    expect(prisma.analyticsEvent.create).toHaveBeenCalledWith({
      data: {
        name: 'practice.solved',
        userId: 'u1',
        metadata: { problemId: 'p1', long: 'x'.repeat(200) },
        requestId: 'r1',
      },
    });
  });

  it('drops unknown event names instead of polluting the table', async () => {
    const { service, prisma, logger } = createService();
    await service.record('totally.made.up', { userId: 'u1' });
    expect(prisma.analyticsEvent.create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('never throws when the database is down', async () => {
    const { service, prisma } = createService();
    (prisma.analyticsEvent.create as jest.Mock).mockRejectedValue(new Error('db down'));
    await expect(service.record('auth.login', { userId: 'u1' })).resolves.toBeUndefined();
  });

  it('builds overview, funnel, and retention shapes from empty data', async () => {
    const { service } = createService();
    const overview = await service.overview(7);
    expect(overview.days).toBe(7);
    expect(overview.daily).toEqual([]);
    expect(overview.weeklyActiveUsers).toBe(0);
    const funnel = await service.funnel(7);
    expect(funnel.stages[0]).toMatchObject({ stage: 'auth.registered', users: 0 });
    expect(funnel.cohortUsers).toBe(0);
    const retention = await service.retention(7);
    expect(retention.cells).toEqual([]);
  });
});
