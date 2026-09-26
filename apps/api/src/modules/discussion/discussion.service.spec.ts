import type { PrismaService } from '@apteez/database';
import type { DiscussionListQuery } from '@apteez/validation';
import {
  DiscussionDuplicateReportError,
  DiscussionForbiddenError,
  DiscussionInvalidTargetError,
  DiscussionLockedError,
} from './discussion.errors';
import { DiscussionService } from './discussion.service';

const AUTHOR = {
  id: 'a1',
  username: 'ada',
  displayName: 'Ada',
  avatarKey: null,
  institution: null,
};

function post(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    authorId: 'a1',
    title: 'Title of thread',
    body: 'Body text',
    tags: ['math'],
    problemId: null,
    isPinned: false,
    isLocked: false,
    isResolved: false,
    viewCount: 3,
    reactionCount: 0,
    replyCount: 0,
    lastActivityAt: new Date('2026-01-02T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    author: AUTHOR,
    ...overrides,
  };
}

function reply(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    postId: 'p1',
    authorId: 'a1',
    body: 'A reply',
    isAcceptedSolution: false,
    reactionCount: 0,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    deletedAt: null,
    author: AUTHOR,
    ...overrides,
  };
}

type PrismaMock = ReturnType<typeof createPrisma>;

function createPrisma() {
  const prisma = {
    discussionPost: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    discussionReply: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    discussionReaction: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    discussionReport: {
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)(prisma)
      : Promise.all(arg as Promise<unknown>[]),
  );
  return prisma;
}

function makeService(): { service: DiscussionService; prisma: PrismaMock } {
  const prisma = createPrisma();
  const analytics = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new DiscussionService(prisma as unknown as PrismaService, analytics as never);
  return { service, prisma };
}

const author = { id: 'a1', permissions: [] as string[] };
const moderator = { id: 'mod', permissions: ['moderate:discussions'] };

describe('DiscussionService', () => {
  describe('list', () => {
    it('maps rows to summaries inside the paginated envelope', async () => {
      const { service, prisma } = makeService();
      prisma.discussionPost.findMany.mockResolvedValue([post()]);
      prisma.discussionPost.count.mockResolvedValue(1);

      const result = await service.list({
        page: 1,
        pageSize: 20,
        sort: 'latest',
      } as DiscussionListQuery);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]?.title).toBe('Title of thread');
      expect(result.items[0]?.lastActivityAt).toBe('2026-01-02T00:00:00.000Z');
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(prisma.discussionPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
    });

    it('filters unanswered threads and orders top threads by reactions', async () => {
      const { service, prisma } = makeService();
      prisma.discussionPost.findMany.mockResolvedValue([]);
      prisma.discussionPost.count.mockResolvedValue(0);

      await service.list({ page: 1, pageSize: 20, sort: 'unanswered' } as DiscussionListQuery);
      expect(prisma.discussionPost.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, replyCount: 0 },
          orderBy: [{ isPinned: 'desc' }, { lastActivityAt: 'desc' }],
        }),
      );

      await service.list({ page: 1, pageSize: 20, sort: 'top' } as DiscussionListQuery);
      expect(prisma.discussionPost.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          orderBy: [{ reactionCount: 'desc' }, { lastActivityAt: 'desc' }],
        }),
      );
    });

    it('truncates long bodies in the excerpt', async () => {
      const { service, prisma } = makeService();
      prisma.discussionPost.findMany.mockResolvedValue([post({ body: 'x'.repeat(400) })]);
      prisma.discussionPost.count.mockResolvedValue(1);

      const result = await service.list({
        page: 1,
        pageSize: 20,
        sort: 'latest',
      } as DiscussionListQuery);

      expect(result.items[0]?.excerpt).toHaveLength(200);
      expect(result.items[0]?.excerpt.endsWith('...')).toBe(true);
    });
  });

  describe('detail', () => {
    it('increments the view count and derives edit/moderate capabilities', async () => {
      const { service, prisma } = makeService();
      prisma.discussionPost.findFirst.mockResolvedValue(post({ viewCount: 3 }));
      prisma.discussionPost.update.mockResolvedValue(post());
      prisma.discussionReply.findMany.mockResolvedValue([reply()]);
      prisma.discussionReply.count.mockResolvedValue(1);

      const result = await service.detail('p1', { page: 1, pageSize: 30 }, author);

      expect(result.viewCount).toBe(4);
      expect(result.canEdit).toBe(true);
      expect(result.canModerate).toBe(false);
      expect(result.replyTotal).toBe(1);
      expect(prisma.discussionPost.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { viewCount: { increment: 1 } },
      });
    });

    it('throws when the thread is missing or deleted', async () => {
      const { service, prisma } = makeService();
      prisma.discussionPost.findFirst.mockResolvedValue(null);

      await expect(service.detail('p1', { page: 1, pageSize: 30 }, undefined)).rejects.toThrow();
    });
  });

  describe('createReply', () => {
    it('rejects replies on locked threads', async () => {
      const { service, prisma } = makeService();
      prisma.discussionPost.findFirst.mockResolvedValue(post({ isLocked: true }));

      await expect(service.createReply('p1', { body: 'hi there' }, 'u1')).rejects.toBeInstanceOf(
        DiscussionLockedError,
      );
    });

    it('recomputes the reply count and activity timestamp in the same transaction', async () => {
      const { service, prisma } = makeService();
      prisma.discussionPost.findFirst.mockResolvedValue(post());
      prisma.discussionReply.create.mockResolvedValue(reply());
      prisma.discussionReply.count.mockResolvedValue(2);
      prisma.discussionPost.update.mockResolvedValue(post());

      const dto = await service.createReply('p1', { body: 'hi there' }, 'u1');

      expect(dto.body).toBe('A reply');
      expect(prisma.discussionPost.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { replyCount: 2, lastActivityAt: expect.any(Date) },
      });
    });
  });

  describe('acceptReply', () => {
    it('lets the thread author accept a solution and clears the previous one', async () => {
      const { service, prisma } = makeService();
      prisma.discussionReply.findFirst.mockResolvedValue({
        ...reply(),
        post: { authorId: 'a1', isLocked: false, deletedAt: null },
      });
      prisma.discussionReply.updateMany.mockResolvedValue({ count: 1 });
      prisma.discussionReply.update.mockResolvedValue(reply({ isAcceptedSolution: true }));
      prisma.discussionPost.update.mockResolvedValue(post());

      const dto = await service.acceptReply('r1', author);

      expect(dto.isAcceptedSolution).toBe(true);
      expect(prisma.discussionReply.updateMany).toHaveBeenCalledWith({
        where: { postId: 'p1', isAcceptedSolution: true },
        data: { isAcceptedSolution: false },
      });
      expect(prisma.discussionPost.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { isResolved: true },
      });
    });

    it('forbids non-authors who are not moderators', async () => {
      const { service, prisma } = makeService();
      prisma.discussionReply.findFirst.mockResolvedValue({
        ...reply(),
        post: { authorId: 'owner', isLocked: false, deletedAt: null },
      });

      await expect(service.acceptReply('r1', author)).rejects.toBeInstanceOf(
        DiscussionForbiddenError,
      );
    });

    it('allows moderators to accept a solution', async () => {
      const { service, prisma } = makeService();
      prisma.discussionReply.findFirst.mockResolvedValue({
        ...reply(),
        post: { authorId: 'owner', isLocked: false, deletedAt: null },
      });
      prisma.discussionReply.updateMany.mockResolvedValue({ count: 0 });
      prisma.discussionReply.update.mockResolvedValue(reply({ isAcceptedSolution: true }));
      prisma.discussionPost.update.mockResolvedValue(post());

      await expect(service.acceptReply('r1', moderator)).resolves.toBeDefined();
    });
  });

  describe('reactions', () => {
    it('computes the net score from up/down votes', async () => {
      const { service, prisma } = makeService();
      prisma.discussionPost.findFirst.mockResolvedValue(post());
      prisma.discussionReaction.upsert.mockResolvedValue({});
      prisma.discussionReaction.groupBy.mockResolvedValue([
        { type: 'UPVOTE', _count: { _all: 3 } },
        { type: 'DOWNVOTE', _count: { _all: 1 } },
      ]);
      prisma.discussionPost.update.mockResolvedValue(post());

      const result = await service.reactToPost('p1', 'UPVOTE', 'u1');

      expect(result).toEqual({
        target: 'post',
        targetId: 'p1',
        reactionCount: 2,
        myReaction: 'UPVOTE',
      });
    });

    it('removes the reaction when the type is null', async () => {
      const { service, prisma } = makeService();
      prisma.discussionPost.findFirst.mockResolvedValue(post());
      prisma.discussionReaction.deleteMany.mockResolvedValue({ count: 1 });
      prisma.discussionReaction.groupBy.mockResolvedValue([]);
      prisma.discussionPost.update.mockResolvedValue(post());

      const result = await service.reactToPost('p1', null, 'u1');

      expect(prisma.discussionReaction.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', postId: 'p1' },
      });
      expect(result.myReaction).toBeNull();
      expect(result.reactionCount).toBe(0);
    });
  });

  describe('report', () => {
    it('rejects a target that is neither a post nor a reply', async () => {
      const { service } = makeService();
      await expect(service.report({ reason: 'SPAM' }, {}, 'u1')).rejects.toBeInstanceOf(
        DiscussionInvalidTargetError,
      );
    });

    it('rejects a target that is both a post and a reply', async () => {
      const { service } = makeService();
      await expect(
        service.report({ reason: 'SPAM' }, { postId: 'p1', replyId: 'r1' }, 'u1'),
      ).rejects.toBeInstanceOf(DiscussionInvalidTargetError);
    });

    it('rejects duplicate reports by the same member', async () => {
      const { service, prisma } = makeService();
      prisma.discussionPost.findFirst.mockResolvedValue(post());
      prisma.discussionReport.findFirst.mockResolvedValue({ id: 'rep1' });

      await expect(
        service.report({ reason: 'SPAM' }, { postId: 'p1' }, 'u1'),
      ).rejects.toBeInstanceOf(DiscussionDuplicateReportError);
    });

    it('creates a report for a valid reply target', async () => {
      const { service, prisma } = makeService();
      prisma.discussionReply.findFirst.mockResolvedValue({
        ...reply(),
        post: { authorId: 'a1', isLocked: false, deletedAt: null },
      });
      prisma.discussionReport.findFirst.mockResolvedValue(null);
      prisma.discussionReport.create.mockResolvedValue({});

      await expect(
        service.report({ reason: 'ABUSE', detail: 'rude' }, { replyId: 'r1' }, 'u1'),
      ).resolves.toEqual({ reported: true });
      expect(prisma.discussionReport.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ replyId: 'r1', postId: null, reason: 'ABUSE' }),
      });
    });
  });

  describe('moderation', () => {
    it('forbids non-moderators from pinning', async () => {
      const { service } = makeService();
      await expect(service.setPinned('p1', true, author)).rejects.toBeInstanceOf(
        DiscussionForbiddenError,
      );
    });

    it('lets a moderator edit another author thread', async () => {
      const { service, prisma } = makeService();
      prisma.discussionPost.findFirst.mockResolvedValue(post({ authorId: 'owner' }));
      prisma.discussionPost.update.mockResolvedValue(post());
      prisma.discussionReply.findMany.mockResolvedValue([]);
      prisma.discussionReply.count.mockResolvedValue(0);

      await expect(
        service.updateThread('p1', { title: 'New', body: 'Body', tags: [] }, moderator),
      ).resolves.toBeDefined();
    });
  });

  describe('deleteReply', () => {
    it('refreshes the reply count after a soft delete', async () => {
      const { service, prisma } = makeService();
      prisma.discussionReply.findFirst.mockResolvedValue({
        ...reply(),
        post: { authorId: 'a1', isLocked: false, deletedAt: null },
      });
      prisma.discussionReply.update.mockResolvedValue({});
      prisma.discussionReply.count.mockResolvedValue(0);
      prisma.discussionPost.update.mockResolvedValue(post());

      await service.deleteReply('r1', author);

      expect(prisma.discussionPost.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: { replyCount: 0, lastActivityAt: expect.any(Date) },
      });
    });
  });
});
