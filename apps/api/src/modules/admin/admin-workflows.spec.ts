import type { PrismaService } from '@apteez/database';
import { AdminConflictError, AdminNotFoundError, AdminValidationError } from './admin.errors';
import { AdminContributionsService } from './admin-contributions.service';
import { AdminProblemsService } from './admin-problems.service';
import { AdminReportsService } from './admin-reports.service';
import { AdminContestsService } from './admin-contests.service';
import { AdminDiscussionsService } from './admin-discussions.service';
import type { AdminCaller } from './admin-access';

const REVIEWER: AdminCaller = {
  id: 'reviewer1',
  roles: ['admin'],
  permissions: ['review:contributions', 'manage:questions'],
};
const MODERATOR: AdminCaller = {
  id: 'mod1',
  roles: ['admin'],
  permissions: ['moderate:discussions'],
};
const MANAGER: AdminCaller = { id: 'mgr1', roles: ['admin'], permissions: ['manage:contests'] };

function contributionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    contributorId: 'user1',
    title: 'Sample contribution',
    statement: 'What is 2 + 2? It is a simple arithmetic question for testing.',
    options: [
      { text: '3', assetKey: null, isCorrect: false },
      { text: '4', assetKey: null, isCorrect: true },
      { text: '5', assetKey: null, isCorrect: false },
    ],
    explanation: 'Basic addition gives four.',
    difficulty: 'EASY',
    categoryId: 'cat1',
    rating: 1500,
    examTags: [],
    source: null,
    topicId: 'topic1',
    sourceUrl: null,
    status: 'PENDING',
    reviewerId: null,
    reviewerNote: null,
    feedbackForContributor: null,
    submittedAt: new Date('2026-01-01T00:00:00.000Z'),
    reviewedAt: null,
    resultingProblemId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    contributor: { id: 'user1', username: 'user1', displayName: 'User One' },
    reviewer: null,
    topic: { id: 'topic1', name: 'Arithmetic', slug: 'arithmetic', categoryId: 'cat1' },
    aiReviews: [],
    ...overrides,
  };
}

function createPrisma() {
  return {
    contribution: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    topic: { findFirst: jest.fn() },
    category: { findFirst: jest.fn() },
    examTag: { findMany: jest.fn().mockResolvedValue([]) },
    contributionAiReview: { create: jest.fn(), deleteMany: jest.fn() },
    problem: {
      create: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    problemOption: { create: jest.fn() },
    adminAuditLog: { create: jest.fn() },
    report: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    user: { findUnique: jest.fn() },
    contest: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    },
    contestParticipant: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    contestSuspiciousEvent: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    discussionReport: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    },
    discussionPost: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
    },
    discussionReply: {
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    submission: { groupBy: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
}

type PrismaMock = ReturnType<typeof createPrisma>;

function baseDeps(prisma: PrismaMock) {
  (prisma.$transaction as jest.Mock).mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  );
  return {
    audit: { log: jest.fn().mockResolvedValue(undefined) },
    events: { notifyUser: jest.fn().mockResolvedValue(undefined) },
    aiQueue: {
      enqueueProblemEmbed: jest.fn().mockResolvedValue(undefined),
      enqueueContributionReview: jest.fn().mockResolvedValue(undefined),
    },
    logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() },
  };
}

describe('AdminContributionsService', () => {
  function setup() {
    const prisma = createPrisma();
    const deps = baseDeps(prisma);
    const precheck = {
      runPrecheck: jest.fn(),
      duplicateCandidates: jest.fn().mockResolvedValue([]),
    };
    const similar = { invalidateSimilar: jest.fn().mockResolvedValue(undefined) };
    const analytics = { record: jest.fn().mockResolvedValue(undefined) };
    const quality = { recordReviewOutcome: jest.fn().mockResolvedValue(undefined) };
    const storage = { getDownloadUrls: jest.fn().mockResolvedValue(new Map()) };
    const service = new AdminContributionsService(
      prisma as unknown as PrismaService,
      deps.audit as never,
      deps.events as never,
      deps.aiQueue as never,
      precheck as never,
      similar as never,
      analytics as never,
      quality as never,
      storage as never,
    );
    return { service, prisma, deps, quality, precheck };
  }

  it('approves once: claims atomically, mints exactly one problem, audits, notifies', async () => {
    const { service, prisma, deps } = setup();
    (prisma.contribution.findUnique as jest.Mock).mockResolvedValue(contributionRow());
    (prisma.contribution.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.problem.create as jest.Mock).mockResolvedValue({ id: 'prob1' });
    const txProblemCreate = prisma.problem.create as jest.Mock;
    (prisma.contribution.findUnique as jest.Mock)
      .mockResolvedValueOnce(contributionRow())
      .mockResolvedValueOnce({ resultingProblemId: 'prob1' })
      .mockResolvedValueOnce(contributionRow({ status: 'APPROVED', resultingProblemId: 'prob1' }));
    const detail = await service.approve('c1', {}, REVIEWER);
    expect(detail.status).toBe('APPROVED');
    expect(deps.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'contribution.approve', targetId: 'c1' }),
    );
    expect(txProblemCreate).toHaveBeenCalledTimes(1);
    // Options mint in the same nested create (single statement, no transaction).
    expect(txProblemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoryId: 'cat1',
          rating: 1500,
          options: expect.objectContaining({ create: expect.any(Array) }),
        }),
      }),
    );
    expect(deps.events.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user1', type: 'CONTRIBUTION_APPROVED' }),
    );
  });

  it('is idempotent on double approve and safe on races', async () => {
    const { service, prisma } = setup();
    (prisma.contribution.findUnique as jest.Mock).mockResolvedValue(
      contributionRow({ status: 'APPROVED', resultingProblemId: 'prob1' }),
    );
    const detail = await service.approve('c1', {}, REVIEWER);
    expect(detail.status).toBe('APPROVED');
    expect(prisma.problem.create as jest.Mock).not.toHaveBeenCalled();
  });

  it('refuses approval without a section mapping', async () => {
    const { service, prisma } = setup();
    (prisma.contribution.findUnique as jest.Mock).mockResolvedValue(
      contributionRow({ categoryId: null, topicId: null, topic: null }),
    );
    await expect(service.approve('c1', {}, REVIEWER)).rejects.toBeInstanceOf(AdminValidationError);
  });

  it('normalizes a hand-typed topic on approve ("Time and Work" → time-and-work)', async () => {
    const { service, prisma } = setup();
    (prisma.contribution.findUnique as jest.Mock)
      .mockResolvedValueOnce(contributionRow({ topicId: null, topic: null }))
      .mockResolvedValueOnce({ resultingProblemId: 'prob1' })
      .mockResolvedValueOnce(contributionRow({ status: 'APPROVED', resultingProblemId: 'prob1' }));
    (prisma.contribution.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.topic.findFirst as jest.Mock).mockResolvedValue({
      id: 't-tw',
      categoryId: 'cat1',
    });
    (prisma.problem.create as jest.Mock).mockResolvedValue({ id: 'prob1' });
    const detail = await service.approve('c1', { topicSlug: 'Time and Work' }, REVIEWER);
    expect(detail.status).toBe('APPROVED');
    expect(prisma.topic.findFirst as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ slug: 'time-and-work' }) }),
    );
    expect(prisma.problem.create as jest.Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ topicId: 't-tw', categoryId: 'cat1' }),
      }),
    );
  });

  it('rejects with feedback and notifies the contributor', async () => {
    const { service, prisma, deps } = setup();
    (prisma.contribution.findUnique as jest.Mock)
      .mockResolvedValueOnce(contributionRow())
      .mockResolvedValueOnce(contributionRow({ status: 'REJECTED' }));
    (prisma.contribution.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    const detail = await service.reject(
      'c1',
      { feedback: 'Needs clearer distractors here.' },
      REVIEWER,
    );
    expect(detail.status).toBe('REJECTED');
    expect(deps.events.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CONTRIBUTION_REJECTED' }),
    );
  });

  it('requires feedback for request-changes', async () => {
    const { service } = setup();
    await expect(service.requestChanges('c1', {}, REVIEWER)).rejects.toBeInstanceOf(
      AdminValidationError,
    );
  });

  it('lets reviewers edit pending content and clears stale analysis', async () => {
    const { service, prisma, deps, precheck } = setup();
    (prisma.contribution.findUnique as jest.Mock).mockResolvedValue(contributionRow());
    (prisma.category.findFirst as jest.Mock).mockResolvedValue({ id: 'cat1' });
    (prisma.contribution.update as jest.Mock).mockResolvedValue({ id: 'c1' });
    (prisma.contributionAiReview.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.contribution.findUnique as jest.Mock).mockResolvedValueOnce(contributionRow());
    const detail = await service.updateForReview(
      'c1',
      {
        type: 'QUANTITATIVE',
        difficulty: 'HARD',
        categorySlug: 'quantitative',
        statement: 'What is 3 + 3? A simple arithmetic question for testing here.',
        options: [{ text: '5' }, { text: '6' }],
        correctAnswerIndex: 1,
        explanation: 'Basic addition: three plus three equals six, always true.',
        examTagSlugs: [],
        assets: [],
      },
      REVIEWER,
    );
    expect(prisma.contribution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ difficulty: 'HARD', categoryId: 'cat1' }),
      }),
    );
    expect(prisma.contributionAiReview.deleteMany).toHaveBeenCalledWith({
      where: { contributionId: 'c1' },
    });
    expect(deps.audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'contribution.edit', targetId: 'c1' }),
    );
    expect(detail.id).toBe('c1');
    expect(precheck.runPrecheck).not.toHaveBeenCalled();
  });

  it('analysis never changes status (AI cannot publish)', async () => {
    const { service, prisma, precheck } = setup();
    (precheck.runPrecheck as jest.Mock).mockResolvedValue({
      row: {
        id: 'ai1',
        model: 'precheck-v1',
        suggestedTopic: null,
        suggestedSubtopic: null,
        suggestedDifficulty: null,
        answerConsistent: true,
        duplicateProbability: 0.1,
        issues: ['Statement is very short — check it stands alone.'],
        recommendation: 'REVIEW',
        createdAt: new Date(),
      },
      issues: 1,
    });
    const review = await service.analyze('c1', REVIEWER);
    expect(['APPROVE', 'REVIEW', 'REJECT']).toContain(review.recommendation);
    expect(prisma.contribution.updateMany as jest.Mock).not.toHaveBeenCalled();
    expect(prisma.contribution.update as jest.Mock).not.toHaveBeenCalled();
  });

  it('stores external AI reviews without touching status', async () => {
    const { service, prisma } = setup();
    (prisma.contribution.findUnique as jest.Mock).mockResolvedValue({ id: 'c1' });
    (prisma.contributionAiReview.create as jest.Mock).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'ai2',
        suggestedTopic: null,
        suggestedSubtopic: null,
        suggestedDifficulty: null,
        duplicateProbability: null,
        answerConsistent: null,
        ...data,
        createdAt: new Date(),
      }),
    );
    const review = await service.storeAiReview(
      'c1',
      { model: 'ai-reviewer-v1', issues: ['Weak distractors.'], recommendation: 'REVIEW' },
      REVIEWER,
    );
    expect(review.aiGenerated).toBe(true);
    expect(review.recommendation).toBe('REVIEW');
  });
});

describe('AdminProblemsService', () => {
  function setup() {
    const prisma = createPrisma();
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const aiQueue = { enqueueProblemEmbed: jest.fn().mockResolvedValue(undefined) };
    const embeddings = { markStale: jest.fn().mockResolvedValue(undefined) };
    const similar = { invalidateSimilar: jest.fn().mockResolvedValue(undefined) };
    const storage = { delete: jest.fn().mockResolvedValue(undefined) };
    const service = new AdminProblemsService(
      prisma as unknown as PrismaService,
      audit as never,
      aiQueue as never,
      embeddings as never,
      similar as never,
      storage as never,
    );
    return { service, prisma, audit };
  }

  it('rejects illegal transitions and audits legal ones', async () => {
    const { service, prisma, audit } = setup();
    (prisma.problem.findUnique as jest.Mock).mockResolvedValue({ status: 'PUBLISHED' });
    await expect(service.transition('p1', 'PUBLISHED', REVIEWER)).rejects.toBeInstanceOf(
      AdminConflictError,
    );
    (prisma.problem.findUnique as jest.Mock).mockResolvedValue({ status: 'DRAFT' });
    (prisma.problem.update as jest.Mock).mockResolvedValue({
      id: 'p1',
      title: 'T',
      status: 'PUBLISHED',
    });
    const result = await service.transition('p1', 'PUBLISHED', REVIEWER);
    expect(result.status).toBe('PUBLISHED');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'problem.published' }),
    );
  });

  it('throws for unknown problems', async () => {
    const { service, prisma } = setup();
    (prisma.problem.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.transition('missing', 'PUBLISHED', REVIEWER)).rejects.toBeInstanceOf(
      AdminNotFoundError,
    );
  });
});

describe('AdminReportsService', () => {
  function setup() {
    const prisma = createPrisma();
    const deps = baseDeps(prisma);
    const service = new AdminReportsService(
      prisma as unknown as PrismaService,
      deps.audit as never,
      deps.events as never,
    );
    return { service, prisma, deps };
  }

  it('maps duplicate open reports to a conflict, not a second row', async () => {
    const { service, prisma } = setup();
    (prisma.problem.findUnique as jest.Mock).mockResolvedValue({ title: 'P' });
    (prisma.report.create as jest.Mock).mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' }),
    );
    await expect(
      service.file(
        {
          targetType: 'PROBLEM',
          targetId: '11111111-1111-4111-8111-111111111111',
          reason: 'Wrong answer',
        },
        'u1',
      ),
    ).rejects.toThrow('already have an open report');
  });

  it('rejects reports against missing targets', async () => {
    const { service, prisma } = setup();
    (prisma.problem.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      service.file(
        {
          targetType: 'PROBLEM',
          targetId: '11111111-1111-4111-8111-111111111111',
          reason: 'Wrong answer',
        },
        'u1',
      ),
    ).rejects.toBeInstanceOf(AdminNotFoundError);
  });

  it('resolves idempotently and notifies the reporter', async () => {
    const { service, prisma, deps } = setup();
    (prisma.report.findUnique as jest.Mock).mockResolvedValue({
      id: 'r1',
      reporterId: 'u9',
      status: 'OPEN',
      assignedModeratorId: null,
      resolution: null,
    });
    (prisma.report.update as jest.Mock).mockResolvedValue({ id: 'r1' });
    (prisma.report.findUnique as jest.Mock)
      .mockResolvedValueOnce({
        id: 'r1',
        reporterId: 'u9',
        status: 'OPEN',
        assignedModeratorId: null,
        resolution: null,
      })
      .mockResolvedValueOnce({
        id: 'r1',
        reporter: { id: 'u9', username: null, displayName: 'U' },
        reporterId: 'u9',
        targetType: 'PROBLEM',
        targetId: 'p1',
        reason: 'Wrong',
        description: null,
        status: 'RESOLVED',
        priority: 'NORMAL',
        assignedModerator: null,
        resolution: 'Fixed.',
        createdAt: new Date(),
        resolvedAt: new Date(),
      });
    (prisma.problem.findUnique as jest.Mock).mockResolvedValue({ title: 'P' });
    const resolved = await service.resolve(
      'r1',
      { status: 'RESOLVED', resolution: 'Fixed.' },
      MODERATOR,
    );
    expect(resolved.status).toBe('RESOLVED');
    expect(deps.events.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u9', type: 'REPORT_RESOLVED' }),
    );
  });
});

describe('AdminContestsService', () => {
  function setup() {
    const prisma = createPrisma();
    const deps = baseDeps(prisma);
    const service = new AdminContestsService(
      prisma as unknown as PrismaService,
      deps.audit as never,
      deps.events as never,
    );
    return { service, prisma, deps };
  }

  it('cancels safely twice and refuses finished contests', async () => {
    const { service, prisma } = setup();
    (prisma.contest.findUnique as jest.Mock).mockResolvedValue({ status: 'CANCELLED', title: 'C' });
    await expect(service.cancel('c1', 'duplicate request here', MANAGER)).resolves.toMatchObject({
      status: 'CANCELLED',
    });
    (prisma.contest.findUnique as jest.Mock).mockResolvedValue({ status: 'ENDED', title: 'C' });
    await expect(service.cancel('c1', 'too late to cancel', MANAGER)).rejects.toBeInstanceOf(
      AdminConflictError,
    );
  });

  it('rejects metadata edits on live contests', async () => {
    const { service, prisma } = setup();
    (prisma.contest.findUnique as jest.Mock).mockResolvedValue({
      status: 'LIVE',
      title: 'C',
      description: null,
      rules: null,
    });
    await expect(service.updateMeta('c1', { title: 'New title' }, MANAGER)).rejects.toBeInstanceOf(
      AdminConflictError,
    );
  });
});

describe('AdminDiscussionsService', () => {
  function setup() {
    const prisma = createPrisma();
    baseDeps(prisma);
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const discussions = {
      deleteThread: jest.fn().mockResolvedValue(undefined),
      deleteReply: jest.fn().mockResolvedValue(undefined),
      setLocked: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AdminDiscussionsService(
      prisma as unknown as PrismaService,
      discussions as never,
      audit as never,
    );
    return { service, prisma, audit, discussions };
  }

  it('restores hidden threads and rebuilds counters', async () => {
    const { service, prisma } = setup();
    (prisma.discussionPost.findUnique as jest.Mock).mockResolvedValue({
      id: 'p1',
      deletedAt: new Date(),
    });
    (prisma.discussionPost.update as jest.Mock).mockResolvedValue({});
    (prisma.discussionReply.count as jest.Mock).mockResolvedValue(4);
    await expect(service.restorePost('p1', MODERATOR)).resolves.toEqual({ restored: true });
  });

  it('requires moderation permission even for staff-shaped callers', async () => {
    const { service } = setup();
    const impostor = { id: 'x', roles: ['user'], permissions: [] as string[] };
    await expect(service.hidePost('p1', impostor)).rejects.toThrow();
  });
});
