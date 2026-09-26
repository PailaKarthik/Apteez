import type { PrismaService } from '@apteez/database';
import type { ContributionQuestionInput } from '@apteez/validation';
import { ContributionNotFoundError } from './contribution.errors';
import { ContributionService } from './contribution.service';

function createService() {
  const prisma = {
    category: { findFirst: jest.fn().mockResolvedValue({ id: 'cat1' }) },
    examTag: { findMany: jest.fn().mockResolvedValue([]) },
    topic: { findFirst: jest.fn() },
    contribution: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    userRole: { findMany: jest.fn().mockResolvedValue([]) },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    contributionAiReview: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  } as unknown as PrismaService;
  const aiQueue = { enqueueContributionReview: jest.fn().mockResolvedValue(undefined) };
  const analytics = { record: jest.fn().mockResolvedValue(undefined) };
  const flags = {
    isEnabled: jest.fn().mockReturnValue(true),
    requireEnabled: jest.fn(),
  };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const precheck = { runPrecheck: jest.fn().mockResolvedValue({ row: {}, issues: 0 }) };
  return {
    service: new ContributionService(
      prisma,
      aiQueue as never,
      analytics as never,
      flags as never,
      logger as never,
      precheck as never,
    ),
    prisma,
    aiQueue,
    flags,
    logger,
    precheck,
  };
}

const INPUT: ContributionQuestionInput = {
  type: 'QUANTITATIVE',
  difficulty: 'MEDIUM',
  categorySlug: 'quantitative',
  topic: 'Arithmetic',
  examTagSlugs: [],
  assets: [],
  statement: 'What is 2 + 2? A simple arithmetic question for testing purposes.',
  options: [{ text: '3' }, { text: '4' }, { text: '5' }],
  correctAnswerIndex: 1,
  explanation: 'Basic addition: two plus two equals four, always.',
  sourceUrl: '',
};

describe('ContributionService', () => {
  it('normalizes the frozen option set with exactly one flagged answer', async () => {
    const { service, prisma } = createService();
    (prisma.topic.findFirst as jest.Mock).mockResolvedValue({ id: 'topic1' });
    (prisma.contribution.create as jest.Mock).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'c1',
        status: 'PENDING',
        ...data,
      }),
    );
    const result = await service.submit(INPUT, 'user1');
    expect(result.status).toBe('PENDING');
    const stored = (prisma.contribution.create as jest.Mock).mock.calls[0][0].data;
    expect(stored.options).toEqual([
      { text: '3', assetKey: null, isCorrect: false },
      { text: '4', assetKey: null, isCorrect: true },
      { text: '5', assetKey: null, isCorrect: false },
    ]);
    expect(stored.topicId).toBe('topic1');
  });

  it('schedules an advisory AI review without blocking the submit', async () => {
    const { service, prisma, aiQueue } = createService();
    (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.contribution.create as jest.Mock).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'c1',
        status: 'PENDING',
        ...data,
      }),
    );
    const result = await service.submit(INPUT, 'user1');
    expect(result.status).toBe('PENDING');
    expect(aiQueue.enqueueContributionReview).toHaveBeenCalledWith('c1');
  });

  it('refuses submission server-side when community contributions are disabled', async () => {
    const { service, prisma, flags } = createService();
    (flags.requireEnabled as jest.Mock).mockImplementation(() => {
      throw Object.assign(new Error('disabled'), { statusCode: 503 });
    });
    await expect(service.submit(INPUT, 'user1')).rejects.toMatchObject({ statusCode: 503 });
    expect(prisma.contribution.create).not.toHaveBeenCalled();
  });

  it('skips AI review scheduling when the review flag is off', async () => {
    const { service, prisma, aiQueue, flags } = createService();
    (flags.isEnabled as jest.Mock).mockReturnValue(false);
    (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.contribution.create as jest.Mock).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'c1',
        status: 'PENDING',
        ...data,
      }),
    );
    const result = await service.submit(INPUT, 'user1');
    expect(result.status).toBe('PENDING');
    expect(aiQueue.enqueueContributionReview).not.toHaveBeenCalled();
  });

  it('notifies reviewers without blocking the submit', async () => {
    const { service, prisma } = createService();
    (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.contribution.create as jest.Mock).mockResolvedValue({ id: 'c1', status: 'PENDING' });
    (prisma.userRole.findMany as jest.Mock).mockResolvedValue([
      { userId: 'reviewer1' },
      { userId: 'user1' },
    ]);
    const result = await service.submit(INPUT, 'user1');
    expect(result.status).toBe('PENDING');
    // Contributor excluded; reviewer paged with the submit type.
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: 'reviewer1',
          type: 'CONTRIBUTION_SUBMITTED',
          title: 'New contribution needs review.',
          body: expect.stringContaining('waiting in the review queue'),
        },
      ],
    });
  });

  it('revises an owned PENDING contribution', async () => {
    const { service, prisma } = createService();
    (prisma.contribution.findFirst as jest.Mock).mockResolvedValue({ id: 'c1', status: 'PENDING' });
    (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.contribution.update as jest.Mock).mockResolvedValue({ id: 'c1', status: 'PENDING' });
    const result = await service.resubmit('c1', INPUT, 'user1');
    expect(result).toEqual({ id: 'c1', status: 'PENDING' });
    expect(prisma.contribution.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1' } }),
    );
  });

  it('drops stale AI reviews on resubmit so precheck reruns on new content', async () => {
    const { service, prisma, aiQueue } = createService();
    (prisma.contribution.findFirst as jest.Mock).mockResolvedValue({ id: 'c1', status: 'PENDING' });
    (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.contribution.update as jest.Mock).mockResolvedValue({ id: 'c1', status: 'PENDING' });
    await service.resubmit('c1', INPUT, 'user1');
    expect(prisma.contributionAiReview.deleteMany).toHaveBeenCalledWith({
      where: { contributionId: 'c1' },
    });
    expect(aiQueue.enqueueContributionReview).toHaveBeenCalledWith('c1');
  });

  it('refuses revision once a reviewer holds or decided it', async () => {
    const { service, prisma } = createService();
    (prisma.contribution.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      status: 'UNDER_REVIEW',
    });
    await expect(service.resubmit('c1', INPUT, 'user1')).rejects.toThrow(
      'A reviewer is looking at this now',
    );
    (prisma.contribution.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      status: 'APPROVED',
    });
    await expect(service.resubmit('c1', INPUT, 'user1')).rejects.toThrow(
      'Decided contributions cannot be edited',
    );
    expect(prisma.contribution.update).not.toHaveBeenCalled();
  });

  it('leaves topic unmapped when the free-text topic matches nothing', async () => {
    const { service, prisma } = createService();
    (prisma.topic.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.contribution.create as jest.Mock).mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'c1',
        status: 'PENDING',
        ...data,
      }),
    );
    await service.submit({ ...INPUT, topic: 'Uncharted Waters' }, 'user1');
    expect((prisma.contribution.create as jest.Mock).mock.calls[0][0].data.topicId).toBeNull();
  });

  it('strips answer flags and staff notes from owner detail', async () => {
    const { service, prisma } = createService();
    (prisma.contribution.findFirst as jest.Mock).mockResolvedValue({
      id: 'c1',
      title: 'T',
      statement: INPUT.statement,
      options: [
        { text: '3', assetKey: null, isCorrect: false },
        { text: '4', assetKey: null, isCorrect: true },
      ],
      explanation: INPUT.explanation,
      difficulty: 'MEDIUM',
      status: 'PENDING',
      feedbackForContributor: null,
      resultingProblemId: null,
      submittedAt: new Date(),
      reviewedAt: null,
    });
    const detail = await service.detailForUser('c1', 'user1');
    expect(detail.options).toEqual([
      { text: '3', assetKey: null },
      { text: '4', assetKey: null },
    ]);
    expect(JSON.stringify(detail)).not.toContain('reviewerNote');
  });

  it('hides other users contributions (IDOR guard)', async () => {
    const { service, prisma } = createService();
    (prisma.contribution.findFirst as jest.Mock).mockResolvedValue(null);
    await expect(service.detailForUser('c1', 'stranger')).rejects.toBeInstanceOf(
      ContributionNotFoundError,
    );
  });
});
