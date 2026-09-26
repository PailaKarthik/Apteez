import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { ReportDto } from '@apteez/types';
import type {
  AdminReportsQuery,
  AdminReportResolveInput,
  ReportCreateInput,
} from '@apteez/validation';
import { EventQueueService } from '../../queue/event-queue.service';
import { AdminAuditService } from './admin-audit.service';
import type { AdminCaller } from './admin-access';
import { AdminConflictError, AdminNotFoundError } from './admin.errors';

/**
 * Centralized report queue plus the rate-limited user filing endpoint.
 * Duplicate open reports per (reporter, target) collide on a partial unique
 * index instead of spamming the queue. Every state change is audited and
 * the reporter is notified on resolution.
 */
@Injectable()
export class AdminReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly events: EventQueueService,
  ) {}

  async file(
    input: ReportCreateInput,
    reporterId: string,
  ): Promise<{ id: string; status: string }> {
    await this.assertTargetExists(input.targetType, input.targetId);
    try {
      const created = await this.prisma.report.create({
        data: {
          reporterId,
          targetType: input.targetType,
          targetId: input.targetId,
          reason: input.reason.slice(0, 120),
          description: input.description?.slice(0, 1000) ?? null,
          status: 'OPEN',
        },
        select: { id: true, status: true },
      });
      return created;
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new AdminConflictError('You already have an open report for this target.');
      }
      throw error;
    }
  }

  async queue(query: AdminReportsQuery) {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.report.count({ where }),
      this.prisma.report.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          reporter: { select: { id: true, username: true, displayName: true } },
          assignedModerator: { select: { id: true, username: true, displayName: true } },
        },
      }),
    ]);
    const items: ReportDto[] = [];
    for (const row of rows) {
      items.push({
        id: row.id,
        reporter: row.reporter,
        targetType: row.targetType,
        targetId: row.targetId,
        targetTitle: await this.targetTitle(row.targetType, row.targetId),
        reason: row.reason,
        description: row.description,
        status: row.status,
        priority: row.priority,
        assignedModerator: row.assignedModerator,
        resolution: row.resolution,
        createdAt: row.createdAt.toISOString(),
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
      });
    }
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async resolve(id: string, input: AdminReportResolveInput, caller: AdminCaller, ip?: string) {
    const existing = await this.prisma.report.findUnique({ where: { id } });
    if (!existing) {
      throw new AdminNotFoundError('Report not found.');
    }
    if (existing.status === 'RESOLVED' || existing.status === 'DISMISSED') {
      // Idempotent replay for retries: the stored resolution stands.
      return this.one(id);
    }
    const now = new Date();
    const resolved = input.status === 'RESOLVED' || input.status === 'DISMISSED';
    const updated = await this.prisma.report.update({
      where: { id },
      data: {
        status: input.status,
        assignedModeratorId: input.assigneeId ?? existing.assignedModeratorId,
        resolution: input.resolution?.slice(0, 1000) ?? existing.resolution,
        ...(input.priority ? { priority: input.priority } : {}),
        ...(resolved ? { resolvedAt: now } : { resolvedAt: null }),
      },
    });
    await this.audit.log({
      actorUserId: caller.id,
      action: `report.${input.status.toLowerCase()}`,
      targetType: 'REPORT',
      targetId: id,
      previousValue: { status: existing.status },
      newValue: { status: input.status },
      reason: input.resolution?.slice(0, 500) ?? null,
      ip,
    });
    if (resolved) {
      void this.events
        .notifyUser({
          userId: existing.reporterId,
          type: 'REPORT_RESOLVED',
          title: `Your report was ${input.status === 'RESOLVED' ? 'resolved' : 'dismissed'}.`,
          body: (input.resolution ?? 'An admin reviewed your report.').slice(0, 500),
        })
        .catch(() => undefined);
    }
    return this.one(updated.id);
  }

  async one(id: string): Promise<ReportDto> {
    const row = await this.prisma.report.findUnique({
      where: { id },
      include: {
        reporter: { select: { id: true, username: true, displayName: true } },
        assignedModerator: { select: { id: true, username: true, displayName: true } },
      },
    });
    if (!row) {
      throw new AdminNotFoundError('Report not found.');
    }
    return {
      id: row.id,
      reporter: row.reporter,
      targetType: row.targetType,
      targetId: row.targetId,
      targetTitle: await this.targetTitle(row.targetType, row.targetId),
      reason: row.reason,
      description: row.description,
      status: row.status,
      priority: row.priority,
      assignedModerator: row.assignedModerator,
      resolution: row.resolution,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    };
  }

  private async assertTargetExists(targetType: string, targetId: string): Promise<void> {
    const found = await this.targetTitle(targetType, targetId);
    if (!found) {
      throw new AdminNotFoundError('Report target does not exist.');
    }
  }

  private async targetTitle(targetType: string, targetId: string): Promise<string | null> {
    switch (targetType) {
      case 'PROBLEM': {
        const row = await this.prisma.problem.findUnique({
          where: { id: targetId },
          select: { title: true },
        });
        return row?.title ?? null;
      }
      case 'CONTRIBUTION': {
        const row = await this.prisma.contribution.findUnique({
          where: { id: targetId },
          select: { title: true },
        });
        return row?.title ?? null;
      }
      case 'DISCUSSION_POST': {
        const row = await this.prisma.discussionPost.findUnique({
          where: { id: targetId },
          select: { title: true },
        });
        return row?.title ?? null;
      }
      case 'DISCUSSION_REPLY': {
        const row = await this.prisma.discussionReply.findUnique({
          where: { id: targetId },
          select: { body: true },
        });
        return row ? row.body.slice(0, 80) : null;
      }
      case 'EVENT': {
        const row = await this.prisma.event.findUnique({
          where: { id: targetId },
          select: { title: true },
        });
        return row?.title ?? null;
      }
      case 'CONTEST': {
        const row = await this.prisma.contest.findUnique({
          where: { id: targetId },
          select: { title: true },
        });
        return row?.title ?? null;
      }
      case 'USER': {
        const row = await this.prisma.user.findUnique({
          where: { id: targetId },
          select: { username: true, displayName: true },
        });
        return row ? (row.username ?? row.displayName) : null;
      }
      default:
        return null;
    }
  }
}
