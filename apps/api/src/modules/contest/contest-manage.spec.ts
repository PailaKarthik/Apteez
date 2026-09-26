import { ContestService } from './contest.service';

const CREATOR = { id: 'org-1', roles: ['admin'], permissions: ['manage:contests'] };
const STRANGER = { id: 'user-9', roles: ['user'], permissions: [] as string[] };
const ADMIN = { id: 'admin-1', roles: ['admin'], permissions: ['manage:platform'] };

function draftRow(overrides = {}) {
  const now = new Date();
  return {
    id: 'contest-1',
    title: 'Weekly Sprint',
    description: null,
    rules: null,
    status: 'DRAFT',
    difficulty: 'MEDIUM',
    startsAt: new Date(now.getTime() + 3600_000),
    endsAt: new Date(now.getTime() + 7200_000),
    durationSeconds: 3600,
    registrationOpensAt: new Date(now.getTime() - 1000),
    registrationClosesAt: null,
    maxParticipants: 100,
    questionCount: 2,
    scoringModel: 'SOLVED_COUNT',
    resultVisibility: 'AFTER_END',
    revealAnswersLive: false,
    createdById: 'org-1',
    createdBy: { displayName: 'Org' },
    _count: { participants: 0 },
    ratingStatus: 'PENDING',
    ...overrides,
  };
}

function setup() {
  const prisma = {
    contest: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      count: jest.fn().mockResolvedValue(0),
    },
    contestQuestion: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    problem: { findUnique: jest.fn() },
    contestRatingHistory: { findUnique: jest.fn(), create: jest.fn() },
    contestRating: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    contestResult: { findMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const lock = {
    withLock: jest.fn(async (_key: string, _ttl: number, fn: () => unknown) => fn()),
  };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const ratings = { calculate: jest.fn() };
  const service = new ContestService(
    prisma as never,
    {} as never,
    ratings as never,
    lock as never,
    {} as never,
    {} as never,
    {} as never,
    logger as never,
  );
  return { service, prisma, lock, ratings };
}

type MockPrisma = {
  contest: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  contestQuestion: {
    count: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    delete: jest.Mock;
    updateMany: jest.Mock;
  };
  problem: { findUnique: jest.Mock };
};

function mockManage(
  prisma: MockPrisma,
  row: ReturnType<typeof draftRow>,
  questions: Array<{ id: string; position: number }> = [],
): void {
  prisma.contest.findUnique.mockResolvedValue(row);
  prisma.contestQuestion.findMany.mockResolvedValue(
    questions.map((q) => ({
      ...q,
      points: 1,
      problem: { id: 'p1', title: 'P1', difficulty: 'EASY' },
    })),
  );
}

const CREATE_INPUT = {
  title: 'Weekly Sprint',
  questionCount: 2,
  durationMinutes: 60,
  startsAt: new Date(Date.now() + 3600_000),
  endsAt: new Date(Date.now() + 7200_000),
  difficulty: 'MEDIUM' as const,
  resultVisibility: 'AFTER_END' as const,
  revealAnswersLive: false,
};

describe('ContestService CREATOR management', () => {
  it('creates a DRAFT with a generated slug and converted duration', async () => {
    const { service, prisma } = setup();
    (prisma.contest.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.contest.create as jest.Mock).mockResolvedValue({ id: 'c-new' });
    mockManage(prisma as unknown as MockPrisma, { ...draftRow(), id: 'c-new' });
    const view = await service.createContest(CREATOR, CREATE_INPUT);
    expect(prisma.contest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DRAFT',
          questionCount: 2,
          durationSeconds: 3600,
          createdById: 'org-1',
        }),
      }),
    );
    const slug = (prisma.contest.create as jest.Mock).mock.calls[0][0].data.slug as string;
    expect(slug).toMatch(/^weekly-sprint-/);
    expect(view.addedCount).toBe(0);
    expect(view.canPublish).toBe(false);
  });

  it("forbids strangers but allows admins on another admin's draft", async () => {
    const { service, prisma } = setup();
    mockManage(prisma as unknown as MockPrisma, draftRow());
    await expect(service.manageView('contest-1', STRANGER)).rejects.toThrow(
      'Only an admin can do this.',
    );
    await expect(service.manageView('contest-1', ADMIN)).resolves.toMatchObject({
      id: 'contest-1',
    });
  });

  it('adds questions strictly in order up to the target count', async () => {
    const { service, prisma } = setup();
    const row = draftRow();
    (prisma.contest.findUnique as jest.Mock).mockResolvedValue(row);
    (prisma.problem.findUnique as jest.Mock).mockResolvedValue({ id: 'p1', status: 'PUBLISHED' });
    (prisma.contestQuestion.count as jest.Mock).mockResolvedValue(0);
    mockManage(prisma as unknown as MockPrisma, row, [{ id: 'q1', position: 0 }]);
    const view = await service.addQuestion('contest-1', CREATOR, { problemId: 'p1' });
    expect(prisma.contestQuestion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { contestId: 'contest-1', problemId: 'p1', position: 0 } }),
    );
    expect(view.addedCount).toBe(1);

    (prisma.contestQuestion.count as jest.Mock).mockResolvedValue(1);
    await expect(
      service.addQuestion('contest-1', CREATOR, { problemId: 'p2', position: 5 }),
    ).rejects.toThrow('slot 2 of 2 is next');

    (prisma.contestQuestion.count as jest.Mock).mockResolvedValue(2);
    await expect(service.addQuestion('contest-1', CREATOR, { problemId: 'p2' })).rejects.toThrow(
      'exactly 2 questions',
    );
  });

  it('rejects unpublished problems', async () => {
    const { service, prisma } = setup();
    (prisma.contest.findUnique as jest.Mock).mockResolvedValue(draftRow());
    (prisma.problem.findUnique as jest.Mock).mockResolvedValue({ id: 'p9', status: 'DRAFT' });
    (prisma.contestQuestion.count as jest.Mock).mockResolvedValue(0);
    await expect(service.addQuestion('contest-1', CREATOR, { problemId: 'p9' })).rejects.toThrow(
      'Only published problems',
    );
  });

  it('publishes only when every slot is filled', async () => {
    const { service, prisma } = setup();
    const row = draftRow();
    (prisma.contest.findUnique as jest.Mock).mockResolvedValue(row);
    (prisma.contestQuestion.findMany as jest.Mock).mockResolvedValue([
      { id: 'q1', position: 0, points: 1, problem: { id: 'p1', title: 'P1', difficulty: 'EASY' } },
    ]);
    await expect(service.publishContest('contest-1', CREATOR)).rejects.toThrow(
      'Add 1 more question',
    );
    expect(prisma.contest.update).not.toHaveBeenCalled();

    (prisma.contestQuestion.findMany as jest.Mock).mockResolvedValue([
      { id: 'q1', position: 0, points: 1, problem: { id: 'p1', title: 'P1', difficulty: 'EASY' } },
      { id: 'q2', position: 1, points: 1, problem: { id: 'p2', title: 'P2', difficulty: 'EASY' } },
    ]);
    (prisma.contest.update as jest.Mock).mockResolvedValue({});
    const published = await service.publishContest('contest-1', CREATOR);
    expect(prisma.contest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'contest-1' },
        data: expect.objectContaining({ publishedAt: expect.any(Date) }),
      }),
    );
    expect(published.publishBlockers).toEqual([]);
    // Once live as PUBLISHED, the wizard reports nothing left to publish.
    (prisma.contest.findUnique as jest.Mock).mockResolvedValue({ ...row, status: 'PUBLISHED' });
    const after = await service.manageView('contest-1', CREATOR);
    expect(after.status).toBe('PUBLISHED');
    expect(after.canPublish).toBe(false);
  });

  it('lists drafts with attach progress, newest first', async () => {
    const { service, prisma } = setup();
    const now = new Date();
    (prisma.contest.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'c1',
        title: 'Draft One',
        questionCount: 5,
        durationSeconds: 1800,
        updatedAt: now,
        _count: { questions: 3 },
      },
    ]);
    const drafts = await service.listDrafts(CREATOR);
    expect(prisma.contest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'DRAFT' }),
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(drafts).toEqual([
      {
        id: 'c1',
        title: 'Draft One',
        questionCount: 5,
        addedCount: 3,
        durationMinutes: 30,
        updatedAt: now.toISOString(),
      },
    ]);
  });

  it('scopes the draft list to the creator for non-admins', async () => {
    const { service, prisma } = setup();
    (prisma.contest.findMany as jest.Mock).mockResolvedValue([]);
    await service.listDrafts({
      id: 'user-9',
      roles: ['user'],
      permissions: ['manage:contests'],
    });
    expect(prisma.contest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'DRAFT', createdById: 'user-9' }),
      }),
    );
  });

  it('retries stuck ratings on ENDED contests and completes when empty', async () => {
    const { service, prisma } = setup();
    const now = new Date();
    const endedFailed = {
      ...draftRow(),
      status: 'ENDED',
      ratingStatus: 'FAILED',
      startsAt: new Date(now.getTime() - 7200_000),
      endsAt: new Date(now.getTime() - 3600_000),
    };
    (prisma.contest.findUnique as jest.Mock)
      .mockResolvedValueOnce(endedFailed)
      .mockResolvedValueOnce(endedFailed)
      .mockResolvedValue({ ...endedFailed, ratingStatus: 'COMPLETED' });
    (prisma.contestResult.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.contest.update as jest.Mock).mockResolvedValue({});
    const outcome = await service.retryRatings('contest-1', CREATOR);
    expect(outcome).toMatchObject({ ranked: 0, ratingsApplied: true, ratingStatus: 'COMPLETED' });
    expect(prisma.contest.update as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ ratingStatus: 'COMPLETED' }) }),
    );
  });

  it('flips due contests live during discovery', async () => {
    const { service, prisma } = setup();
    await service.list({ phase: 'live', page: 1, pageSize: 12 } as never);
    expect(prisma.contest.updateMany as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'LIVE' } }),
    );
    expect(prisma.contest.updateMany as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REGISTRATION_OPEN' } }),
    );
  });

  it('refuses rating retry before the contest ends', async () => {
    const { service, prisma } = setup();
    const now = new Date();
    (prisma.contest.findUnique as jest.Mock).mockResolvedValue({
      ...draftRow(),
      status: 'LIVE',
      ratingStatus: 'PENDING',
      startsAt: new Date(now.getTime() - 1000),
      endsAt: new Date(now.getTime() + 3600_000),
    });
    await expect(service.retryRatings('contest-1', CREATOR)).rejects.toThrow(
      'Ratings settle after the contest ends.',
    );
  });

  it('syncs PUBLISHED to LIVE once the start passes', async () => {
    const { service, prisma } = setup();
    const now = new Date();
    (prisma.contest.findUnique as jest.Mock).mockResolvedValue({
      ...draftRow(),
      status: 'PUBLISHED',
      startsAt: new Date(now.getTime() - 1000),
      endsAt: new Date(now.getTime() + 3600_000),
      registrationOpensAt: null,
    });
    (prisma.contest.update as jest.Mock).mockResolvedValue({});
    (prisma.contest.findUnique as jest.Mock).mockResolvedValueOnce({
      ...draftRow(),
      status: 'PUBLISHED',
      startsAt: new Date(now.getTime() - 1000),
      endsAt: new Date(now.getTime() + 3600_000),
      registrationOpensAt: null,
    });
    await service.detail('contest-1');
    expect(prisma.contest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'LIVE' } }),
    );
  });
});
