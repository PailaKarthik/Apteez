import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { ChallengeService } from './challenge.service';

function setup() {
  const prisma = {
    category: { findFirst: jest.fn() },
    challengeRating: { upsert: jest.fn() },
    challenge: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    challengeQuestion: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
    user: { findUnique: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
  };
  const lock = { withLock: jest.fn(async (_key: string, _ttl: number, fn: () => unknown) => fn()) };
  const config = {
    get: (key: string) =>
      ({ CHALLENGE_DURATION_MINUTES: 2, CHALLENGE_SOLO_WAIT_SECONDS: 15 })[key],
  } as unknown as ConfigService<Env, true>;
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const liveState = {
    writeLiveState: jest.fn(async () => undefined),
    setActiveUser: jest.fn(async () => undefined),
  };
  const service = new ChallengeService(
    prisma as never,
    {} as never,
    {} as never,
    liveState as never,
    lock as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    config,
    logger as never,
  );
  return { service, prisma, lock };
}

describe('ChallengeService timed solo + endless top-up', () => {
  it('creates a solo run against the bot, unrated and COUNTDOWN', async () => {
    const { service, prisma } = setup();
    (prisma.category.findFirst as jest.Mock).mockResolvedValue({ id: 'c1', name: 'Quant' });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'bot-1' });
    (prisma.challengeRating.upsert as jest.Mock).mockResolvedValue({ rating: 1200 });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'p1', rating: 1200 }]);
    (prisma.challenge.create as jest.Mock).mockImplementation(async () => ({ id: 'ch-1' }));
    const loadSpy = jest
      .spyOn(service, 'loadChallenge')
      .mockResolvedValue({ id: 'ch-1' } as never);
    const created = await service.createSoloChallenge('user-1', 'quantitative');
    expect(created).toMatchObject({ id: 'ch-1' });
    expect(prisma.challenge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isSolo: true, status: 'COUNTDOWN', player2Id: 'bot-1' }),
      }),
    );
    loadSpy.mockRestore();
  });

  it('creates the bot lazily once and reuses it', async () => {
    const { service, prisma } = setup();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.user.create as jest.Mock).mockResolvedValue({ id: 'bot-9' });
    await expect(service.ensureChallengeBot()).resolves.toBe('bot-9');
    await expect(service.ensureChallengeBot()).resolves.toBe('bot-9');
    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it('tops up questions excluding asked ones and bumps the total', async () => {
    const { service, prisma } = setup();
    (prisma.challengeQuestion.findMany as jest.Mock).mockResolvedValue([
      { position: 0, problemId: 'p1' },
      { position: 1, problemId: 'p2' },
    ]);
    (prisma.challenge.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      categoryId: 'c1',
      player1RatingSnapshot: 1200,
      player2RatingSnapshot: 1000,
    });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'p3', rating: 1100 }]);
    (prisma.challengeQuestion.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.challengeQuestion.count as jest.Mock).mockResolvedValue(3);
    // answeredCount 2 with 2 rows and buffer 3 → top-up triggers.
    const topped = await (service as unknown as { topUpQuestions: (id: string, n: number) => Promise<boolean> }).topUpQuestions('ch-1', 2);
    expect(topped).toBe(true);
    expect(prisma.challenge.update).toHaveBeenCalledWith({
      where: { id: 'ch-1' },
      data: { questionCount: 3 },
    });
  });

  it('recycles the pool excluding recent questions when exhausted', async () => {
    const { service, prisma } = setup();
    (prisma.challengeQuestion.findMany as jest.Mock).mockResolvedValue([
      { position: 0, problemId: 'p1' },
    ]);
    (prisma.challenge.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      categoryId: 'c1',
      player1RatingSnapshot: 1200,
      player2RatingSnapshot: 1000,
    });
    const seen: string[][] = [];
    (prisma.$queryRaw as jest.Mock).mockImplementation(async (...args: unknown[]) => {
      seen.push(args as string[]);
      return seen.length === 1 ? [] : [{ id: 'p9', rating: 1100 }];
    });
    (prisma.challengeQuestion.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.challengeQuestion.count as jest.Mock).mockResolvedValue(2);
    const topped = await (service as unknown as { topUpQuestions: (id: string, n: number) => Promise<boolean> }).topUpQuestions('ch-1', 1);
    expect(topped).toBe(true);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('resolves env minutes into bounded duration seconds', async () => {
    const { service } = setup();
    expect(service.durationSeconds()).toBe(120);
    expect(service.soloWaitSeconds()).toBe(15);
  });
});
