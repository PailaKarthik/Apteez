import type { PrismaService } from '@apteez/database';
import { PersonalizationService } from './personalization.service';

function summary(id: string, rating = 1500) {
  return {
    id,
    title: `Problem ${id}`,
    contentMode: 'TEXT_ONLY',
    difficulty: 'MEDIUM',
    rating,
    category: { slug: 'quant', name: 'Quant' },
    topic: { slug: 'algebra', name: 'Algebra' },
    subtopic: null,
    examTags: [],
    optionCount: 4,
    hasImage: false,
    hasExplanation: false,
    hasShortcut: false,
    publishedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    accuracy: 80,
    solvedCount: 5,
  };
}

function createService() {
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    topic: {
      findFirst: jest.fn().mockResolvedValue({ id: 't1', name: 'Algebra' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    problem: { findMany: jest.fn().mockResolvedValue([]) },
    submission: { findMany: jest.fn().mockResolvedValue([]) },
    favoriteCollectionItem: { findMany: jest.fn().mockResolvedValue([]) },
    userLearningProgress: { findMany: jest.fn().mockResolvedValue([]) },
    learningLesson: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    contest: { findMany: jest.fn().mockResolvedValue([]) },
    event: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  const performance = {
    weakAreas: jest.fn().mockResolvedValue([]),
    byDomain: jest.fn().mockResolvedValue([]),
    overall: jest.fn(),
  };
  const activity = {
    nextFocus: jest.fn().mockResolvedValue({
      topicSlug: null,
      topicName: null,
      domainSlug: null,
      domainName: null,
      reason: 'cold',
      accuracy: null,
      attempts: 0,
      streak: { current: 0, longest: 0, lastActiveDate: null, activeToday: false },
      ratingTrend: 0,
    }),
  };
  const problems = {
    summarizeProblems: jest.fn(async (_userId: string | undefined, ids: string[]) => {
      const map = new Map();
      for (const id of ids) {
        map.set(id, summary(id));
      }
      return map;
    }),
  };
  const contests = { list: jest.fn().mockResolvedValue({ items: [] }) };
  const events = { list: jest.fn().mockResolvedValue({ items: [] }) };
  const redis = { isReady: () => false, get: jest.fn(), set: jest.fn() };
  const logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
  const service = new PersonalizationService(
    prisma,
    performance as never,
    activity as never,
    problems as never,
    contests as never,
    events as never,
    redis as never,
    logger as never,
  );
  return { service, prisma, performance, problems, contests, events };
}

describe('PersonalizationService problems', () => {
  it('serves labeled cold-start discovery without an account', async () => {
    const { service, prisma } = createService();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ problemId: 'p1' }, { problemId: 'p2' }]);
    const items = await service.recommendedProblems(undefined, 2);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ source: 'popular', priority: 1 });
    expect(items[0].reason).toMatch(/popular/i);
  });

  it('prioritizes weak areas, excludes solved, and explains every pick', async () => {
    const { service, prisma, performance } = createService();
    (performance.weakAreas as jest.Mock).mockResolvedValue([
      {
        topicSlug: 'algebra',
        topicName: 'Algebra',
        domainSlug: 'quant',
        domainName: 'Quant',
        attempts: 20,
        accuracy: 40,
        avgTimeSeconds: 90,
        recentTrend: -5,
        severity: 'high',
        reason: 'Accuracy 40% is below 50%.',
      },
    ]);
    // Level 1500: 1600 (above) must sort before 1400 (reinforcement).
    (prisma.problem.findMany as jest.Mock).mockResolvedValue([
      { id: 'low', rating: 1400 },
      { id: 'high', rating: 1600 },
    ]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ avg: 1500 }]);
    (prisma.submission.findMany as jest.Mock).mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) => {
        if (where.isCorrect === true) {
          return [{ problemId: 'solved-1' }];
        }
        return [];
      },
    );
    const items = await service.recommendedProblems('u1', 2);
    expect(items.map((item) => item.problem.id)).toEqual(['high', 'low']);
    expect(items[0].source).toBe('weak-area');
    expect(items[0].reason).toContain('40%');
    expect(items.every((item) => item.problem.id !== 'solved-1')).toBe(true);
  });

  it('widens the level band before giving up on a topic', async () => {
    const { service, prisma, performance } = createService();
    (performance.weakAreas as jest.Mock).mockResolvedValue([
      {
        topicSlug: 'algebra',
        topicName: 'Algebra',
        domainSlug: 'quant',
        domainName: 'Quant',
        attempts: 20,
        accuracy: 40,
        avgTimeSeconds: 90,
        recentTrend: 0,
        severity: 'high',
        reason: 'Low.',
      },
    ]);
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ avg: 1500 }]);
    (prisma.problem.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'wide', rating: 1900 }]);
    const items = await service.recommendedProblems('u1', 1);
    expect(items.map((item) => item.problem.id)).toEqual(['wide']);
  });
});

describe('PersonalizationService topics + learning', () => {
  it('leads topics with weak areas and labels cold-start honestly', async () => {
    const { service, performance, prisma } = createService();
    (performance.weakAreas as jest.Mock).mockResolvedValue([
      {
        topicSlug: 'algebra',
        topicName: 'Algebra',
        domainSlug: 'quant',
        domainName: 'Quant',
        attempts: 15,
        accuracy: 50,
        avgTimeSeconds: 80,
        recentTrend: -2,
        severity: 'medium',
        reason: 'Below 65%.',
      },
    ]);
    const items = await service.recommendedTopics('u1', 3);
    expect(items[0]).toMatchObject({ source: 'weak-area', topicSlug: 'algebra' });

    (prisma.topic.findMany as jest.Mock).mockResolvedValue([
      { slug: 't1', name: 'T1', category: { slug: 'q', name: 'Q' } },
    ]);
    const cold = await service.recommendedTopics(undefined, 1);
    expect(cold[0]).toMatchObject({ source: 'popular' });
  });

  it('continues started lessons before suggesting weak-area lessons', async () => {
    const { service, prisma } = createService();
    (prisma.userLearningProgress.findMany as jest.Mock).mockResolvedValue([
      {
        lesson: {
          id: 'l1',
          slug: 'l1',
          title: 'Lesson 1',
          topic: { slug: 't1', title: 'T1', path: { slug: 'p1', title: 'P1' } },
        },
      },
    ]);
    const items = await service.continueLearning('u1', 2);
    expect(items[0]).toMatchObject({
      lessonId: 'l1',
      status: 'STARTED',
      reason: 'Pick up where you left off.',
    });
  });
});

describe('PersonalizationService contests + events + home', () => {
  it('skips registered contests and explains open ones', async () => {
    const { service, contests } = createService();
    (contests.list as jest.Mock).mockResolvedValue({
      items: [
        { id: 'c1', name: 'Open Cup', isRegistered: false },
        { id: 'c2', name: 'Joined Cup', isRegistered: true },
      ],
    });
    const items = await service.recommendedContests('u1', 5);
    expect(items.map((item) => item.contest.id)).toEqual(['c1']);
    expect(items[0].reason).toMatch(/registration/i);
  });

  it('bundles a complete home payload for signed-out visitors', async () => {
    const { service, prisma } = createService();
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ problemId: 'p1' }]);
    const home = await service.home(undefined, undefined);
    expect(home.problems).toHaveLength(1);
    expect(home.problems[0].source).toBe('popular');
    expect(home.focus.reason).toMatch(/sign in/i);
    expect(home.continueLearning).toBeDefined();
  });
});

describe('SimilarProblemService retrieval', () => {
  async function createSimilarService() {
    const { SimilarProblemService } = await import('../search/similar-problem.service');
    const prisma = {
      problem: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'p1',
          status: 'PUBLISHED',
          topicId: 't1',
          subtopicId: null,
          difficulty: 'MEDIUM',
          rating: 1500,
        }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'p2', difficulty: 'MEDIUM', rating: 1520 },
          { id: 'p3', difficulty: 'HARD', rating: 1900 },
        ]),
      },
      $queryRaw: jest.fn().mockRejectedValue(new Error('vector unavailable')),
    };
    const problems = {
      summarizeProblems: jest.fn(async (_userId: string | undefined, ids: string[]) => {
        const map = new Map();
        for (const id of ids) {
          map.set(id, { id, title: `Problem ${id}` });
        }
        return map;
      }),
    };
    const logger = { warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    const redis = { isReady: jest.fn().mockReturnValue(false), get: jest.fn(), set: jest.fn() };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'EMBEDDING_MODEL') {
          return 'text-embedding-3-small';
        }
        if (key === 'EMBEDDING_DIMENSIONS') {
          return 1536;
        }
        throw new Error(`Unexpected config key: ${key}`);
      }),
    };
    const service = new SimilarProblemService(
      prisma as never,
      problems as never,
      redis as never,
      config as never,
      logger as never,
    );
    return { service, prisma };
  }

  it('falls back to the lexical band when vectors are unavailable', async () => {
    const { service } = await createSimilarService();
    const hits = await service.findSimilar('p1', 5);
    expect(hits).toHaveLength(2);
    expect(hits.every((hit) => hit.source === 'lexical-fallback')).toBe(true);
    expect(hits[0]!.problem.id).toBe('p2');
  });

  it('returns nothing for missing or unpublished problems', async () => {
    const { service, prisma } = await createSimilarService();
    (prisma.problem.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.findSimilar('missing', 5)).resolves.toEqual([]);
  });
});
