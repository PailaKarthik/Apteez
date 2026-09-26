import type { PrismaService } from '@apteez/database';
import { AdminValidationError } from './admin.errors';
import { AdminProblemsService } from './admin-problems.service';

const CALLER = { id: 'admin1', roles: ['admin'], permissions: ['manage:questions'] };

function setup() {
  const prisma = {
    problem: {
      findUnique: jest.fn().mockResolvedValue({
        title: 'T',
        statement: 'S',
        explanation: null,
        difficulty: 'EASY',
        rating: 1000,
        exams: [],
      }),
      update: jest.fn().mockResolvedValue({ id: 'p1', title: 'T', status: 'DRAFT' }),
      create: jest.fn(),
    },
    examTag: { findMany: jest.fn().mockResolvedValue([]) },
    problemExam: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn(),
    },
    category: { findFirst: jest.fn() },
    topic: { findFirst: jest.fn() },
    subtopic: { findFirst: jest.fn() },
    report: { groupBy: jest.fn().mockResolvedValue([]) },
    submission: {
      groupBy: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    favoriteCollectionItem: { count: jest.fn().mockResolvedValue(0) },
    challengeQuestion: { count: jest.fn().mockResolvedValue(0) },
    contestQuestion: { count: jest.fn().mockResolvedValue(0) },
    eventQuestion: { count: jest.fn().mockResolvedValue(0) },
    learningLessonProblem: { count: jest.fn().mockResolvedValue(0) },
    problemOption: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    problemAsset: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const deps = {
    audit: { log: jest.fn().mockResolvedValue(undefined) },
    aiQueue: { enqueueProblemEmbed: jest.fn().mockResolvedValue(undefined) },
    embeddings: { markStale: jest.fn().mockResolvedValue(undefined) },
    similar: { invalidateSimilar: jest.fn().mockResolvedValue(undefined) },
    storage: { delete: jest.fn().mockResolvedValue(undefined) },
  };
  const service = new AdminProblemsService(
    prisma as unknown as PrismaService,
    deps.audit as never,
    deps.aiQueue as never,
    deps.embeddings as never,
    deps.similar as never,
    deps.storage as never,
  );
  return { service, prisma, deps };
}

describe('AdminProblemsService exam folders', () => {
  it('lists exam tags per problem from a single batched query', async () => {
    const { service, prisma } = setup();
    (prisma.problem as unknown as Record<string, jest.Mock>).count = jest.fn().mockResolvedValue(1);
    (prisma.problem as unknown as Record<string, jest.Mock>).findMany = jest
      .fn()
      .mockResolvedValue([
        {
          id: 'p1',
          title: 'T',
          status: 'PUBLISHED',
          difficulty: 'EASY',
          rating: 1000,
          createdAt: new Date(),
          publishedAt: new Date(),
          category: { name: 'Quant' },
          topic: { name: 'Arithmetic' },
          _count: { submissions: 0 },
        },
      ]);
    (prisma.problemExam.findMany as jest.Mock).mockResolvedValue([
      { problemId: 'p1', examTag: { slug: 'ssc' } },
      { problemId: 'p1', examTag: { slug: 'banking' } },
    ]);
    const page = await service.list({ page: 1, pageSize: 20 });
    expect(page.items[0]?.examTags).toEqual(['banking', 'ssc']);
  });

  it('rejects unknown exam slugs without touching links', async () => {
    const { service, prisma } = setup();
    (prisma.examTag.findMany as jest.Mock).mockResolvedValue([]);
    await expect(service.update('p1', { examTagSlugs: ['nope'] }, CALLER)).rejects.toBeInstanceOf(
      AdminValidationError,
    );
    expect(prisma.problemExam.deleteMany).not.toHaveBeenCalled();
    expect(prisma.problemExam.createMany).not.toHaveBeenCalled();
  });

  it('replaces the link set for valid slugs', async () => {
    const { service, prisma, deps } = setup();
    (prisma.examTag.findMany as jest.Mock).mockResolvedValue([
      { id: 'e1', slug: 'ssc' },
      { id: 'e2', slug: 'banking' },
    ]);
    await service.update('p1', { examTagSlugs: ['ssc', 'banking', 'ssc'] }, CALLER);
    expect(prisma.problemExam.deleteMany).toHaveBeenCalledWith({ where: { problemId: 'p1' } });
    expect(prisma.problemExam.createMany).toHaveBeenCalledWith({
      data: [
        { problemId: 'p1', examTagId: 'e1' },
        { problemId: 'p1', examTagId: 'e2' },
      ],
      skipDuplicates: true,
    });
    expect(deps.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'problem.update', targetId: 'p1' }),
    );
  });

  it('clears all links when given an empty set', async () => {
    const { service, prisma } = setup();
    await service.update('p1', { examTagSlugs: [] }, CALLER);
    expect(prisma.problemExam.deleteMany).toHaveBeenCalledWith({ where: { problemId: 'p1' } });
    expect(prisma.problemExam.createMany).not.toHaveBeenCalled();
  });

  it('leaves links alone when examTagSlugs is omitted', async () => {
    const { service, prisma } = setup();
    await service.update('p1', { rating: 1200 }, CALLER);
    expect(prisma.problemExam.deleteMany).not.toHaveBeenCalled();
    expect(prisma.examTag.findMany).not.toHaveBeenCalled();
  });

  it('derives difficulty from the rating band when difficulty is omitted', async () => {
    const { service, prisma } = setup();
    await service.update('p1', { rating: 1700 }, CALLER);
    expect(prisma.problem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rating: 1700, difficulty: 'HARD' }),
      }),
    );
  });

  it('keeps an explicitly provided difficulty over the derived band', async () => {
    const { service, prisma } = setup();
    await service.update('p1', { rating: 1700, difficulty: 'EASY' }, CALLER);
    expect(prisma.problem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ rating: 1700, difficulty: 'EASY' }),
      }),
    );
  });
});

describe('AdminProblemsService create', () => {
  const valid = {
    title: 'Time and work',
    statement: 'A does work in 10 days.',
    rating: 1500,
    categorySlug: 'quant',
    topicSlug: 'time-work',
    options: [
      { text: '5 days', isCorrect: true },
      { text: '6 days', isCorrect: false },
    ],
    examTagSlugs: [] as string[],
    publish: false,
  };

  function setupCreate() {
    const { service, prisma, deps } = setup();
    (prisma.category.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' });
    (prisma.topic.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
    (prisma.subtopic.findFirst as jest.Mock).mockResolvedValue({ id: 's1' });
    (prisma.problem.create as jest.Mock).mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        id: 'p9',
        title: args.data.title,
        status: args.data.status,
      }),
    );
    return { service, prisma, deps };
  }

  it('creates a PUBLISHED problem with band-derived difficulty and nested options', async () => {
    const { service, prisma, deps } = setupCreate();
    const created = await service.create(valid, CALLER);
    expect(created).toMatchObject({ id: 'p9', status: 'PUBLISHED' });
    expect(prisma.problem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Time and work',
          difficulty: 'MEDIUM',
          rating: 1500,
          status: 'PUBLISHED',
          publishedAt: expect.any(Date),
          categoryId: 'c1',
          topicId: 't1',
          options: {
            create: [
              { position: 0, text: '5 days', isCorrect: true },
              { position: 1, text: '6 days', isCorrect: false },
            ],
          },
        }),
      }),
    );
    expect(deps.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'problem.create', targetId: 'p9' }),
    );
  });

  it('leaves topic and subtopic empty when skipped', async () => {
    const { service, prisma } = setupCreate();
    const { topicSlug: _dropped, ...withoutTopic } = valid;
    await service.create(withoutTopic, CALLER);
    expect(prisma.topic.findFirst).not.toHaveBeenCalled();
    expect(prisma.problem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ topicId: null, subtopicId: null }),
      }),
    );
  });

  it('deletes an unreferenced problem with its children', async () => {
    const { service, prisma, deps } = setup();
    (prisma.problem.findUnique as jest.Mock).mockResolvedValue({
      id: 'p9',
      title: 'Old question',
      assets: [{ objectKey: 'a1' }],
      options: [{ assetKey: 'o1' }, { assetKey: null }],
    });
    for (const model of [
      'submission',
      'favoriteCollectionItem',
      'challengeQuestion',
      'contestQuestion',
      'eventQuestion',
      'learningLessonProblem',
    ]) {
      (prisma as unknown as Record<string, Record<string, jest.Mock>>)[model] = {
        count: jest.fn().mockResolvedValue(0),
      };
    }
    (prisma.problemOption as unknown as Record<string, jest.Mock>) = {
      deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
    };
    (prisma.problemAsset as unknown as Record<string, jest.Mock>) = {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    (prisma.problemExam as unknown as Record<string, jest.Mock>) = {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    (prisma.problem as unknown as Record<string, jest.Mock>).delete = jest
      .fn()
      .mockResolvedValue({ id: 'p9' });
    const result = await service.destroy('p9', CALLER);
    expect(result).toEqual({ id: 'p9', title: 'Old question' });
    expect(deps.storage.delete).toHaveBeenCalledTimes(2);
    expect(deps.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'problem.delete', targetId: 'p9' }),
    );
  });

  it('refuses delete while live references exist', async () => {
    const { service, prisma } = setup();
    (prisma.problem.findUnique as jest.Mock).mockResolvedValue({
      id: 'p9',
      title: 'Used question',
      assets: [],
      options: [],
    });
    (prisma.submission as unknown as Record<string, jest.Mock>) = {
      count: jest.fn().mockResolvedValue(3),
    };
    for (const model of [
      'favoriteCollectionItem',
      'challengeQuestion',
      'contestQuestion',
      'eventQuestion',
      'learningLessonProblem',
    ]) {
      (prisma as unknown as Record<string, Record<string, jest.Mock>>)[model] = {
        count: jest.fn().mockResolvedValue(0),
      };
    }
    await expect(service.destroy('p9', CALLER)).rejects.toThrow('still referenced by 3 submissions');
  });

  it('rejects a subtopic without its topic and unknown taxonomy', async () => {
    const { service, prisma } = setupCreate();
    const { topicSlug: _dropped, ...withoutTopic } = valid;
    await expect(
      service.create({ ...withoutTopic, subtopicSlug: 's1' }, CALLER),
    ).rejects.toBeInstanceOf(AdminValidationError);
    (prisma.category.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.create(valid, CALLER)).rejects.toBeInstanceOf(AdminValidationError);
    (prisma.category.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' });
    (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.create(valid, CALLER)).rejects.toBeInstanceOf(AdminValidationError);
    (prisma.topic.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
    (prisma.examTag.findMany as jest.Mock).mockResolvedValue([]);
    await expect(
      service.create({ ...valid, examTagSlugs: ['nope'] }, CALLER),
    ).rejects.toBeInstanceOf(AdminValidationError);
  });
});
