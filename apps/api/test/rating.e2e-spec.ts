import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@apteez/database';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app-setup';
import { type Env, validateEnv } from '../src/config/env';
import { RatingHistoryService } from '../src/modules/rating/rating-history.service';
import { RatingService } from '../src/modules/rating/rating.service';

describe('Rating (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let ratings: RatingService;
  let memberId: string;
  let adminId: string;
  let categoryId: string;
  const createdChallengeIds: string[] = [];

  beforeAll(async () => {
    const realEnv = validateEnv(process.env);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: keyof Env) => realEnv[key],
      } as unknown as ConfigService<Env, true>)
      .compile();
    app = moduleFixture.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    ratings = app.get(RatingService);

    const member = await prisma.user.findUniqueOrThrow({ where: { email: 'member@apteez.dev' } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@apteez.dev' } });
    memberId = member.id;
    adminId = admin.id;
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: 'quantitative' } });
    categoryId = category.id;
  }, 60_000);

  afterAll(async () => {
    if (createdChallengeIds.length > 0) {
      await prisma.challengeRatingHistory.deleteMany({
        where: { challengeId: { in: createdChallengeIds } },
      });
      await prisma.challenge.deleteMany({ where: { id: { in: createdChallengeIds } } });
    }
    await prisma.challengeRating.deleteMany({
      where: { userId: { in: [memberId, adminId] }, domainSlug: 'verbal' },
    });
    await app?.close();
  });

  async function resetDomain(domainSlug: string): Promise<void> {
    await prisma.challengeRatingHistory.deleteMany({
      where: { domainSlug, userId: { in: [memberId, adminId] } },
    });
    await prisma.challengeRating.deleteMany({
      where: { domainSlug, userId: { in: [memberId, adminId] } },
    });
  }

  async function createCompletedChallenge(
    domainSlug: string,
    p1Score: number,
    p2Score: number,
    outcome: 'PLAYER1_WIN' | 'PLAYER2_WIN' | 'DRAW',
  ): Promise<string> {
    const challenge = await prisma.challenge.create({
      data: {
        domainSlug,
        categoryId,
        player1Id: memberId,
        player2Id: adminId,
        player1RatingSnapshot: 1000,
        player2RatingSnapshot: 1000,
        status: 'COMPLETED',
        outcome,
        completionReason: 'COMPLETED',
        winnerId: outcome === 'DRAW' ? null : outcome === 'PLAYER1_WIN' ? memberId : adminId,
        player1Score: p1Score,
        player2Score: p2Score,
        player1Correct: Math.max(0, p1Score),
        player2Correct: Math.max(0, p2Score),
        player1Wrong: Math.max(0, -p1Score),
        player2Wrong: Math.max(0, -p2Score),
        player1Unanswered: 0,
        player2Unanswered: 0,
        questionCount: 5,
        durationSeconds: 300,
        minReadingSeconds: 3,
        matchedAt: new Date(),
        startedAt: new Date(),
        endsAt: new Date(),
        endedAt: new Date(),
      },
      select: { id: true },
    });
    createdChallengeIds.push(challenge.id);
    return challenge.id;
  }

  it('applies a two-sided rating update with history for a decisive win', async () => {
    await resetDomain('verbal');
    const challengeId = await createCompletedChallenge('verbal', 4, 1, 'PLAYER1_WIN');

    const applied = await ratings.processChallenge(challengeId);
    expect(applied).toBe(true);

    const member = await prisma.challengeRating.findUniqueOrThrow({
      where: { userId_domainSlug: { userId: memberId, domainSlug: 'verbal' } },
    });
    const admin = await prisma.challengeRating.findUniqueOrThrow({
      where: { userId_domainSlug: { userId: adminId, domainSlug: 'verbal' } },
    });
    expect(member.rating).toBeGreaterThan(1000);
    expect(admin.rating).toBeLessThan(1000);
    expect(member.wins).toBe(1);
    expect(admin.losses).toBe(1);

    const history = await prisma.challengeRatingHistory.findMany({ where: { challengeId } });
    expect(history).toHaveLength(2);
    const memberHistory = history.find((row) => row.userId === memberId)!;
    expect(memberHistory.result).toBe('WIN');
    expect(memberHistory.ratingBefore).toBe(1000);
    expect(memberHistory.ratingAfter).toBe(member.rating);
    expect(memberHistory.ratingChange).toBe(member.rating - 1000);
    expect(memberHistory.opponentId).toBe(adminId);

    const challenge = await prisma.challenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(challenge.ratingStatus).toBe('COMPLETED');
    expect(challenge.ratingProcessedAt).not.toBeNull();
  });

  it('is idempotent: reprocessing changes nothing and adds no history', async () => {
    const challengeId = createdChallengeIds.at(-1)!;
    const before = await prisma.challengeRating.findUniqueOrThrow({
      where: { userId_domainSlug: { userId: memberId, domainSlug: 'verbal' } },
    });

    const applied = await ratings.processChallenge(challengeId);
    expect(applied).toBe(true);

    const after = await prisma.challengeRating.findUniqueOrThrow({
      where: { userId_domainSlug: { userId: memberId, domainSlug: 'verbal' } },
    });
    expect(after.rating).toBe(before.rating);
    expect(after.gamesPlayed).toBe(before.gamesPlayed);
    const history = await prisma.challengeRatingHistory.count({ where: { challengeId } });
    expect(history).toBe(2);
  });

  it('processes two concurrent requests into exactly one update', async () => {
    const challengeId = await createCompletedChallenge('verbal', 2, 3, 'PLAYER2_WIN');
    const results = await Promise.all([
      ratings.processChallenge(challengeId),
      ratings.processChallenge(challengeId),
      ratings.processChallenge(challengeId),
    ]);
    expect(results.some((value) => value === true)).toBe(true);

    const history = await prisma.challengeRatingHistory.count({ where: { challengeId } });
    expect(history).toBe(2);
    const ratingsRows = await prisma.challengeRating.findMany({
      where: { domainSlug: 'verbal', userId: { in: [memberId, adminId] } },
    });
    expect(ratingsRows).toHaveLength(2);
  });

  it('handles draws without inventing a winner', async () => {
    await resetDomain('verbal');
    const challengeId = await createCompletedChallenge('verbal', 2, 2, 'DRAW');
    await ratings.processChallenge(challengeId);

    const history = await prisma.challengeRatingHistory.findMany({ where: { challengeId } });
    expect(history).toHaveLength(2);
    expect(history.every((row) => row.result === 'DRAW')).toBe(true);
    expect(history.every((row) => row.ratingChange === 0)).toBe(true);
  });

  it('never rates a non-completed challenge', async () => {
    const live = await prisma.challenge.create({
      data: {
        domainSlug: 'quantitative',
        categoryId,
        player1Id: memberId,
        player2Id: adminId,
        player1RatingSnapshot: 1000,
        player2RatingSnapshot: 1000,
        status: 'LIVE',
        questionCount: 5,
        durationSeconds: 300,
        minReadingSeconds: 3,
      },
      select: { id: true },
    });
    createdChallengeIds.push(live.id);
    const applied = await ratings.processChallenge(live.id);
    expect(applied).toBe(false);
    const history = await prisma.challengeRatingHistory.count({ where: { challengeId: live.id } });
    expect(history).toBe(0);
  });

  it('keeps ratings independent per domain', async () => {
    await resetDomain('verbal');
    const challengeId = await createCompletedChallenge('verbal', 3, 0, 'PLAYER1_WIN');
    await ratings.processChallenge(challengeId);

    const quantitative = await prisma.challengeRating.findUnique({
      where: { userId_domainSlug: { userId: memberId, domainSlug: 'quantitative' } },
    });
    const beforeQ = quantitative?.rating ?? 1000;

    const verbal = await prisma.challengeRating.findUniqueOrThrow({
      where: { userId_domainSlug: { userId: memberId, domainSlug: 'verbal' } },
    });
    expect(verbal.rating).toBeGreaterThan(1000);

    const quantitativeAfter = await prisma.challengeRating.findUnique({
      where: { userId_domainSlug: { userId: memberId, domainSlug: 'quantitative' } },
    });
    expect(quantitativeAfter?.rating ?? 1000).toBe(beforeQ);
  });

  it('exposes the caller rating overview with aggregate record', async () => {
    await resetDomain('verbal');
    const challengeId = await createCompletedChallenge('verbal', 4, 0, 'PLAYER1_WIN');
    await ratings.processChallenge(challengeId);

    const overview = await ratings.overview(memberId, 'verbal');
    expect(overview.ratings).toHaveLength(1);
    const domain = overview.ratings[0]!;
    expect(domain.domainSlug).toBe('verbal');
    expect(domain.rating).toBeGreaterThan(1000);
    expect(domain.tier).toBeDefined();
    expect(domain.wins).toBe(1);
    expect(domain.matches).toBe(1);
    expect(domain.winRate).toBe(100);
    expect(domain.latestChange).toBe(domain.rating - 1000);
    expect(overview.totals.matches).toBe(1);
    expect(overview.totals.wins).toBe(1);
  });

  it('returns paginated rating history for the caller', async () => {
    const history = app.get(RatingHistoryService);
    const page = await history.page(memberId, { limit: 5 });
    expect(page.items.length).toBeGreaterThan(0);
    const first = page.items[0]!;
    expect(first.domainSlug).toBeDefined();
    expect(typeof first.ratingChange).toBe('number');
    expect(typeof first.ratingAfter).toBe('number');
    expect(['WIN', 'LOSS', 'DRAW']).toContain(first.result);
  });

  it('orders the leaderboard by rating descending', async () => {
    await resetDomain('verbal');
    const challengeId = await createCompletedChallenge('verbal', 5, 0, 'PLAYER1_WIN');
    await ratings.processChallenge(challengeId);

    const board = await ratings.leaderboard('verbal', undefined, 50);
    expect(board.length).toBeGreaterThan(0);
    const values = board.map((row) => row.rating);
    const sorted = [...values].sort((a, b) => b - a);
    expect(values).toEqual(sorted);
    expect(board[0]!.rank).toBe(1);
    expect(board.some((row) => row.userId === memberId)).toBe(true);
  });

  it('rejects an unknown domain for the leaderboard', async () => {
    await expect(ratings.leaderboard('not-a-domain', undefined, 10)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
