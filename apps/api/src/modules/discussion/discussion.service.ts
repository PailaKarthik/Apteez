import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import { AnalyticsService } from '../analytics/analytics.service';
import type {
  DiscussionAuthorDto,
  DiscussionReactionResultDto,
  DiscussionReactionType,
  DiscussionReplyDto,
  DiscussionThreadDetailDto,
  DiscussionThreadSummaryDto,
  PaginatedData,
} from '@apteez/types';
import type {
  DiscussionCreateReplyInput,
  DiscussionCreateThreadInput,
  DiscussionListQuery,
  DiscussionRepliesQuery,
  DiscussionReportInput,
  DiscussionUpdateThreadInput,
} from '@apteez/validation';
import {
  DiscussionDuplicateReportError,
  DiscussionForbiddenError,
  DiscussionInvalidTargetError,
  DiscussionLockedError,
  DiscussionReplyNotFoundError,
  DiscussionThreadNotFoundError,
} from './discussion.errors';

/** Moderators may lock/pin/delete any thread; authors only their own. */
// Matches the seeded `action:resource` grants: the moderator role carries
// `moderate:discussions`; super admins bypass via `manage:platform`.
const MODERATOR_PERMISSIONS = ['moderate:discussions', 'manage:platform'];

const AUTHOR_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatarKey: true,
  institution: true,
} as const;

type Db = Prisma.TransactionClient | PrismaService;

type PostRow = Prisma.DiscussionPostGetPayload<{
  include: { author: { select: typeof AUTHOR_SELECT } };
}>;

type ReplyRow = Prisma.DiscussionReplyGetPayload<{
  include: { author: { select: typeof AUTHOR_SELECT } };
}>;

type ReplyWithPost = ReplyRow & {
  post: { authorId: string; isLocked: boolean; deletedAt: Date | null };
};

type Moderatable = { id: string; permissions: string[] };

/**
 * Community discussions over the shared taxonomy. Reads are public; every
 * mutation requires a session. Counters (replyCount, reactionCount,
 * lastActivityAt) are derived state recomputed from child rows inside the
 * same transaction as the write, so they can never drift or be spoofed.
 */
@Injectable()
export class DiscussionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  /** Paginated discovery across threads with search, tag, sort and author filters. */
  async list(
    query: DiscussionListQuery,
    viewerId?: string,
  ): Promise<PaginatedData<DiscussionThreadSummaryDto>> {
    const where: Prisma.DiscussionPostWhereInput = { deletedAt: null };
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { body: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.tag) {
      where.tags = { has: query.tag };
    }
    if (query.problemId) {
      where.problemId = query.problemId;
    }
    if (query.authorId) {
      where.authorId = query.authorId;
    }
    if (query.sort === 'unanswered') {
      where.replyCount = 0;
    }

    const orderBy: Prisma.DiscussionPostOrderByWithRelationInput[] =
      query.sort === 'top'
        ? [{ reactionCount: 'desc' }, { lastActivityAt: 'desc' }]
        : [{ isPinned: 'desc' }, { lastActivityAt: 'desc' }];

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.discussionPost.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { author: { select: AUTHOR_SELECT } },
      }),
      this.prisma.discussionPost.count({ where }),
    ]);

    const reactions = await this.reactionsFor(
      viewerId,
      rows.map((row) => row.id),
      [],
    );

    return {
      items: rows.map((row) => this.toSummary(row, reactions.posts.get(row.id) ?? null)),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  /** One thread with a page of its replies. View count increments on read. */
  async detail(
    id: string,
    query: DiscussionRepliesQuery,
    viewer: Moderatable | undefined,
  ): Promise<DiscussionThreadDetailDto> {
    const post = await this.prisma.discussionPost.findFirst({
      where: { id, deletedAt: null },
      include: { author: { select: AUTHOR_SELECT } },
    });
    if (!post) {
      throw new DiscussionThreadNotFoundError();
    }

    await this.prisma.discussionPost.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });

    const replyWhere: Prisma.DiscussionReplyWhereInput = { postId: id, deletedAt: null };
    const [replies, replyTotal] = await this.prisma.$transaction([
      this.prisma.discussionReply.findMany({
        where: replyWhere,
        orderBy: [{ isAcceptedSolution: 'desc' }, { createdAt: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { author: { select: AUTHOR_SELECT } },
      }),
      this.prisma.discussionReply.count({ where: replyWhere }),
    ]);

    const reactions = await this.reactionsFor(
      viewer?.id,
      [post.id],
      replies.map((reply) => reply.id),
    );

    const isModerator = this.isModerator(viewer);
    const viewerId = viewer?.id;
    const summary = this.toSummary(post, reactions.posts.get(post.id) ?? null);

    return {
      ...summary,
      viewCount: post.viewCount + 1,
      body: post.body,
      canEdit: isModerator || post.authorId === viewerId,
      canModerate: isModerator,
      replyPage: query.page,
      replyPageSize: query.pageSize,
      replyTotal,
      replies: replies.map((reply) =>
        this.toReply(reply, reactions.replies.get(reply.id) ?? null, {
          viewerId,
          isModerator,
          threadAuthorId: post.authorId,
          threadLocked: post.isLocked,
        }),
      ),
    };
  }

  /** Create a thread; returns its detail view for the new author. */
  async createThread(
    input: DiscussionCreateThreadInput,
    userId: string,
  ): Promise<DiscussionThreadDetailDto> {
    const created = await this.prisma.discussionPost.create({
      data: {
        authorId: userId,
        title: input.title,
        body: input.body,
        tags: input.tags,
        problemId: input.problemId ?? null,
      },
    });
    void this.analytics.record('discussion.created', { userId, metadata: { postId: created.id } });
    return this.detail(created.id, { page: 1, pageSize: 30 }, { id: userId, permissions: [] });
  }

  /** Edit a thread (author or moderator). */
  async updateThread(
    id: string,
    input: DiscussionUpdateThreadInput,
    user: Moderatable,
  ): Promise<DiscussionThreadDetailDto> {
    const post = await this.requirePost(id);
    this.assertCanEdit(post.authorId, user);
    await this.prisma.discussionPost.update({
      where: { id },
      data: { title: input.title, body: input.body, tags: input.tags },
    });
    return this.detail(id, { page: 1, pageSize: 30 }, user);
  }

  /** Soft-delete a thread (author or moderator). */
  async deleteThread(id: string, user: Moderatable): Promise<void> {
    const post = await this.requirePost(id);
    this.assertCanEdit(post.authorId, user);
    await this.prisma.discussionPost.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Pin/unpin a thread — moderators only. */
  async setPinned(id: string, isPinned: boolean, user: Moderatable): Promise<void> {
    this.assertModerator(user);
    await this.requirePost(id);
    await this.prisma.discussionPost.update({ where: { id }, data: { isPinned } });
  }

  /** Lock/unlock a thread — moderators only; locked threads reject replies. */
  async setLocked(id: string, isLocked: boolean, user: Moderatable): Promise<void> {
    this.assertModerator(user);
    await this.requirePost(id);
    await this.prisma.discussionPost.update({ where: { id }, data: { isLocked } });
  }

  /** Add a reply; rejects on locked threads and refreshes derived counters. */
  async createReply(
    postId: string,
    input: DiscussionCreateReplyInput,
    userId: string,
  ): Promise<DiscussionReplyDto> {
    const post = await this.requirePost(postId);
    if (post.isLocked) {
      throw new DiscussionLockedError();
    }
    const reply = await this.prisma.$transaction(async (tx) => {
      const created = await tx.discussionReply.create({
        data: { postId, authorId: userId, body: input.body },
        include: { author: { select: AUTHOR_SELECT } },
      });
      const replyCount = await tx.discussionReply.count({
        where: { postId, deletedAt: null },
      });
      await tx.discussionPost.update({
        where: { id: postId },
        data: { replyCount, lastActivityAt: new Date() },
      });
      return created;
    });
    void this.analytics.record('discussion.reply_created', {
      userId,
      metadata: { postId, replyId: reply.id },
    });
    return this.toReply(reply, null, {
      viewerId: userId,
      isModerator: false,
      threadAuthorId: post.authorId,
      threadLocked: post.isLocked,
    });
  }

  /** Edit a reply (author or moderator). */
  async updateReply(replyId: string, body: string, user: Moderatable): Promise<DiscussionReplyDto> {
    const reply = await this.requireReply(replyId);
    this.assertCanEdit(reply.authorId, user);
    const updated = await this.prisma.discussionReply.update({
      where: { id: replyId },
      data: { body },
      include: { author: { select: AUTHOR_SELECT } },
    });
    return this.toReply(updated, null, {
      viewerId: user.id,
      isModerator: this.isModerator(user),
      threadAuthorId: reply.post.authorId,
      threadLocked: reply.post.isLocked,
    });
  }

  /** Soft-delete a reply (author or moderator) and refresh the reply count. */
  async deleteReply(replyId: string, user: Moderatable): Promise<void> {
    const reply = await this.requireReply(replyId);
    this.assertCanEdit(reply.authorId, user);
    await this.prisma.$transaction(async (tx) => {
      await tx.discussionReply.update({ where: { id: replyId }, data: { deletedAt: new Date() } });
      const replyCount = await tx.discussionReply.count({
        where: { postId: reply.postId, deletedAt: null },
      });
      await tx.discussionPost.update({
        where: { id: reply.postId },
        data: { replyCount, lastActivityAt: new Date() },
      });
    });
  }

  /** Accept a reply as the thread's solution — thread author or moderator. */
  async acceptReply(replyId: string, user: Moderatable): Promise<DiscussionReplyDto> {
    const reply = await this.requireReply(replyId);
    if (!this.isModerator(user) && reply.post.authorId !== user.id) {
      throw new DiscussionForbiddenError('Only the thread author can accept a solution.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.discussionReply.updateMany({
        where: { postId: reply.postId, isAcceptedSolution: true },
        data: { isAcceptedSolution: false },
      });
      const accepted = await tx.discussionReply.update({
        where: { id: replyId },
        data: { isAcceptedSolution: true },
        include: { author: { select: AUTHOR_SELECT } },
      });
      await tx.discussionPost.update({
        where: { id: reply.postId },
        data: { isResolved: true },
      });
      return accepted;
    });
    return this.toReply(updated, null, {
      viewerId: user.id,
      isModerator: this.isModerator(user),
      threadAuthorId: reply.post.authorId,
      threadLocked: reply.post.isLocked,
    });
  }

  /** Toggle the caller's reaction on a post; null removes it. */
  async reactToPost(
    postId: string,
    type: DiscussionReactionType | null,
    userId: string,
  ): Promise<DiscussionReactionResultDto> {
    await this.requirePost(postId);
    const reactionCount = await this.prisma.$transaction(async (tx) => {
      if (type === null) {
        await tx.discussionReaction.deleteMany({ where: { userId, postId } });
      } else {
        await tx.discussionReaction.upsert({
          where: { userId_postId: { userId, postId } },
          update: { type },
          create: { userId, postId, type },
        });
      }
      const score = await this.postScore(tx, postId);
      await tx.discussionPost.update({ where: { id: postId }, data: { reactionCount: score } });
      return score;
    });
    return { target: 'post', targetId: postId, reactionCount, myReaction: type };
  }

  /** Toggle the caller's reaction on a reply; null removes it. */
  async reactToReply(
    replyId: string,
    type: DiscussionReactionType | null,
    userId: string,
  ): Promise<DiscussionReactionResultDto> {
    await this.requireReply(replyId);
    const reactionCount = await this.prisma.$transaction(async (tx) => {
      if (type === null) {
        await tx.discussionReaction.deleteMany({ where: { userId, replyId } });
      } else {
        await tx.discussionReaction.upsert({
          where: { userId_replyId: { userId, replyId } },
          update: { type },
          create: { userId, replyId, type },
        });
      }
      const score = await this.replyScore(tx, replyId);
      await tx.discussionReply.update({ where: { id: replyId }, data: { reactionCount: score } });
      return score;
    });
    return { target: 'reply', targetId: replyId, reactionCount, myReaction: type };
  }

  /** Report a post or reply; a member may report each target once. */
  async report(
    input: DiscussionReportInput,
    target: { postId?: string; replyId?: string },
    userId: string,
  ): Promise<{ reported: boolean }> {
    if ((target.postId && target.replyId) || (!target.postId && !target.replyId)) {
      throw new DiscussionInvalidTargetError();
    }
    if (target.postId) {
      await this.requirePost(target.postId);
    } else if (target.replyId) {
      await this.requireReply(target.replyId);
    }

    const existing = await this.prisma.discussionReport.findFirst({
      where: {
        reporterId: userId,
        postId: target.postId ?? null,
        replyId: target.replyId ?? null,
      },
      select: { id: true },
    });
    if (existing) {
      throw new DiscussionDuplicateReportError();
    }

    await this.prisma.discussionReport.create({
      data: {
        reporterId: userId,
        postId: target.postId ?? null,
        replyId: target.replyId ?? null,
        reason: input.reason,
        detail: input.detail ?? null,
      },
    });
    void this.analytics.record('discussion.reported', {
      userId,
      metadata: { reason: input.reason },
    });
    return { reported: true };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async postScore(db: Db, postId: string): Promise<number> {
    const rows = await db.discussionReaction.groupBy({
      by: ['type'],
      where: { postId },
      _count: { _all: true },
    });
    return scoreFrom(rows);
  }

  private async replyScore(db: Db, replyId: string): Promise<number> {
    const rows = await db.discussionReaction.groupBy({
      by: ['type'],
      where: { replyId },
      _count: { _all: true },
    });
    return scoreFrom(rows);
  }

  private async requirePost(id: string): Promise<PostRow> {
    const post = await this.prisma.discussionPost.findFirst({
      where: { id, deletedAt: null },
      include: { author: { select: AUTHOR_SELECT } },
    });
    if (!post) {
      throw new DiscussionThreadNotFoundError();
    }
    return post;
  }

  private async requireReply(id: string): Promise<ReplyWithPost> {
    const reply = await this.prisma.discussionReply.findFirst({
      where: { id, deletedAt: null },
      include: {
        author: { select: AUTHOR_SELECT },
        post: { select: { authorId: true, isLocked: true, deletedAt: true } },
      },
    });
    if (!reply || reply.post.deletedAt) {
      throw new DiscussionReplyNotFoundError();
    }
    return reply;
  }

  private async reactionsFor(
    viewerId: string | undefined,
    postIds: string[],
    replyIds: string[],
  ): Promise<{
    posts: Map<string, DiscussionReactionType>;
    replies: Map<string, DiscussionReactionType>;
  }> {
    const posts = new Map<string, DiscussionReactionType>();
    const replies = new Map<string, DiscussionReactionType>();
    if (!viewerId || (postIds.length === 0 && replyIds.length === 0)) {
      return { posts, replies };
    }

    const clauses: Prisma.DiscussionReactionWhereInput[] = [];
    if (postIds.length > 0) {
      clauses.push({ postId: { in: postIds } });
    }
    if (replyIds.length > 0) {
      clauses.push({ replyId: { in: replyIds } });
    }

    const rows = await this.prisma.discussionReaction.findMany({
      where: { userId: viewerId, OR: clauses },
      select: { postId: true, replyId: true, type: true },
    });
    for (const row of rows) {
      if (row.postId) {
        posts.set(row.postId, row.type);
      } else if (row.replyId) {
        replies.set(row.replyId, row.type);
      }
    }
    return { posts, replies };
  }

  private toSummary(
    post: PostRow,
    myReaction: DiscussionReactionType | null,
  ): DiscussionThreadSummaryDto {
    return {
      id: post.id,
      title: post.title,
      excerpt: excerpt(post.body),
      tags: post.tags,
      author: this.toAuthor(post.author),
      problemId: post.problemId,
      isPinned: post.isPinned,
      isLocked: post.isLocked,
      isResolved: post.isResolved,
      viewCount: post.viewCount,
      reactionCount: post.reactionCount,
      replyCount: post.replyCount,
      lastActivityAt: post.lastActivityAt.toISOString(),
      createdAt: post.createdAt.toISOString(),
      myReaction,
    };
  }

  private toReply(
    reply: ReplyRow,
    myReaction: DiscussionReactionType | null,
    ctx: {
      viewerId: string | undefined;
      isModerator: boolean;
      threadAuthorId: string;
      threadLocked: boolean;
    },
  ): DiscussionReplyDto {
    return {
      id: reply.id,
      postId: reply.postId,
      body: reply.body,
      author: this.toAuthor(reply.author),
      isAcceptedSolution: reply.isAcceptedSolution,
      reactionCount: reply.reactionCount,
      createdAt: reply.createdAt.toISOString(),
      updatedAt: reply.updatedAt.toISOString(),
      myReaction,
      canAccept: !ctx.threadLocked && (ctx.isModerator || ctx.viewerId === ctx.threadAuthorId),
      canEdit: ctx.isModerator || ctx.viewerId === reply.authorId,
    };
  }

  private toAuthor(author: {
    id: string;
    username: string | null;
    displayName: string;
    avatarKey: string | null;
    institution: string | null;
  }): DiscussionAuthorDto {
    return {
      id: author.id,
      username: author.username,
      displayName: author.displayName,
      avatarKey: author.avatarKey,
      institution: author.institution,
    };
  }

  private isModerator(user: Moderatable | undefined): boolean {
    return Boolean(
      user?.permissions?.some((permission) => MODERATOR_PERMISSIONS.includes(permission)),
    );
  }

  private assertModerator(user: Moderatable): void {
    if (!this.isModerator(user)) {
      throw new DiscussionForbiddenError('Moderator access is required for this action.');
    }
  }

  private assertCanEdit(authorId: string, user: Moderatable): void {
    if (!this.isModerator(user) && authorId !== user.id) {
      throw new DiscussionForbiddenError();
    }
  }
}

function scoreFrom(
  rows: Array<{ type: DiscussionReactionType; _count: { _all: number } }>,
): number {
  let score = 0;
  for (const row of rows) {
    score += row.type === 'UPVOTE' ? row._count._all : -row._count._all;
  }
  return score;
}

function excerpt(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim();
  return flat.length <= 200 ? flat : `${flat.slice(0, 197)}...`;
}
