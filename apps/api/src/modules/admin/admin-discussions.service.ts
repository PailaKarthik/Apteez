import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { DiscussionReportAdminDto } from '@apteez/types';
import { DiscussionService } from '../discussion/discussion.service';
import { AdminAuditService } from './admin-audit.service';
import type { AdminCaller } from './admin-access';
import { AdminConflictError, AdminNotFoundError } from './admin.errors';

/**
 * Discussion moderation. Reuses DiscussionService for lock/delete (the same
 * guards ordinary moderators hit); restore and report-state transitions are
 * new here. Soft-delete is always reversible and every action is audited —
 * nothing is permanently destroyed through these paths.
 */
@Injectable()
export class AdminDiscussionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discussions: DiscussionService,
    private readonly audit: AdminAuditService,
  ) {}

  async reports(
    status: 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED' | undefined,
    page: number,
    pageSize: number,
  ) {
    const where = status ? { status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.discussionReport.count({ where }),
      this.prisma.discussionReport.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          reporter: { select: { id: true, username: true, displayName: true } },
          post: { select: { id: true, title: true } },
          reply: { select: { id: true, body: true } },
        },
      }),
    ]);
    const items: DiscussionReportAdminDto[] = rows.map((row) => ({
      id: row.id,
      reporter: row.reporter,
      postId: row.postId,
      replyId: row.replyId,
      targetTitle: row.post?.title ?? row.reply?.body.slice(0, 80) ?? null,
      reason: row.reason,
      detail: row.detail,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async setReportStatus(
    id: string,
    status: 'REVIEWING' | 'RESOLVED' | 'DISMISSED',
    caller: AdminCaller,
    ip?: string,
  ): Promise<{ id: string; status: string }> {
    const existing = await this.prisma.discussionReport.findUnique({ where: { id } });
    if (!existing) {
      throw new AdminNotFoundError('Report not found.');
    }
    if (existing.status === status) {
      return { id, status };
    }
    const updated = await this.prisma.discussionReport.update({ where: { id }, data: { status } });
    await this.audit.log({
      actorUserId: caller.id,
      action: `discussion-report.${status.toLowerCase()}`,
      targetType: 'DISCUSSION_REPORT',
      targetId: id,
      previousValue: { status: existing.status },
      newValue: { status },
      ip,
    });
    return { id: updated.id, status: updated.status };
  }

  async hidePost(id: string, caller: AdminCaller, ip?: string, reason?: string) {
    await this.discussions.deleteThread(id, this.moderatable(caller));
    await this.audit.log({
      actorUserId: caller.id,
      action: 'discussion.post.hide',
      targetType: 'DISCUSSION_POST',
      targetId: id,
      reason: reason?.slice(0, 500) ?? null,
      ip,
    });
    return { hidden: true };
  }

  async restorePost(id: string, caller: AdminCaller, ip?: string) {
    const existing = await this.prisma.discussionPost.findUnique({
      where: { id },
      select: { id: true, deletedAt: true },
    });
    if (!existing) {
      throw new AdminNotFoundError('Discussion not found.');
    }
    if (!existing.deletedAt) {
      return { restored: true };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.discussionPost.update({ where: { id }, data: { deletedAt: null } });
      const replyCount = await tx.discussionReply.count({ where: { postId: id, deletedAt: null } });
      await tx.discussionPost.update({ where: { id }, data: { replyCount } });
    });
    await this.audit.log({
      actorUserId: caller.id,
      action: 'discussion.post.restore',
      targetType: 'DISCUSSION_POST',
      targetId: id,
      ip,
    });
    return { restored: true };
  }

  async hideReply(id: string, caller: AdminCaller, ip?: string, reason?: string) {
    await this.discussions.deleteReply(id, this.moderatable(caller));
    await this.audit.log({
      actorUserId: caller.id,
      action: 'discussion.reply.hide',
      targetType: 'DISCUSSION_REPLY',
      targetId: id,
      reason: reason?.slice(0, 500) ?? null,
      ip,
    });
    return { hidden: true };
  }

  async restoreReply(id: string, caller: AdminCaller, ip?: string) {
    const existing = await this.prisma.discussionReply.findUnique({
      where: { id },
      select: { id: true, postId: true, deletedAt: true },
    });
    if (!existing) {
      throw new AdminNotFoundError('Reply not found.');
    }
    if (!existing.deletedAt) {
      return { restored: true };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.discussionReply.update({ where: { id }, data: { deletedAt: null } });
      const replyCount = await tx.discussionReply.count({
        where: { postId: existing.postId, deletedAt: null },
      });
      await tx.discussionPost.update({ where: { id: existing.postId }, data: { replyCount } });
    });
    await this.audit.log({
      actorUserId: caller.id,
      action: 'discussion.reply.restore',
      targetType: 'DISCUSSION_REPLY',
      targetId: id,
      ip,
    });
    return { restored: true };
  }

  async setLocked(id: string, isLocked: boolean, caller: AdminCaller, ip?: string) {
    await this.discussions.setLocked(id, isLocked, this.moderatable(caller));
    await this.audit.log({
      actorUserId: caller.id,
      action: isLocked ? 'discussion.lock' : 'discussion.unlock',
      targetType: 'DISCUSSION_POST',
      targetId: id,
      ip,
    });
    return { locked: isLocked };
  }

  async flagged(page: number, pageSize: number) {
    // Threads with open reports or heavy report history, most active first.
    const [total, rows] = await Promise.all([
      this.prisma.discussionPost.count({
        where: { reports: { some: { status: { in: ['OPEN', 'REVIEWING'] } } } },
      }),
      this.prisma.discussionPost.findMany({
        where: { reports: { some: { status: { in: ['OPEN', 'REVIEWING'] } } } },
        orderBy: [{ lastActivityAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          deletedAt: true,
          isLocked: true,
          replyCount: true,
          author: { select: { id: true, username: true, displayName: true } },
          _count: { select: { reports: { where: { status: { in: ['OPEN', 'REVIEWING'] } } } } },
        },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        author: row.author,
        hidden: row.deletedAt !== null,
        locked: row.isLocked,
        replyCount: row.replyCount,
        openReports: row._count.reports,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  private moderatable(caller: AdminCaller): { id: string; permissions: string[] } {
    if (
      !caller.permissions.includes('moderate:discussions') &&
      !caller.permissions.includes('manage:platform')
    ) {
      throw new AdminConflictError('Discussion moderation permission is required.');
    }
    return { id: caller.id, permissions: caller.permissions };
  }
}
