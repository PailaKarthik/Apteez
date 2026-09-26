import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { AdminContestDto, ContestParticipantAdminDto } from '@apteez/types';
import type { AdminContestsQuery, AdminContestPatchInput } from '@apteez/validation';
import { EventQueueService } from '../../queue/event-queue.service';
import { AdminAuditService } from './admin-audit.service';
import type { AdminCaller } from './admin-access';
import { AdminConflictError, AdminNotFoundError } from './admin.errors';

/**
 * Contest operations. Reads aggregate from canonical rows; cancel and
 * metadata edits are audited. Result/rank rows are never rewritten here —
 * ranking stays owned by ContestService.assignRanks, and suspicious signals
 * are read-only.
 */
@Injectable()
export class AdminContestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly events: EventQueueService,
  ) {}

  async list(query: AdminContestsQuery) {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' as const } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.contest.count({ where }),
      this.prisma.contest.findMany({
        where,
        orderBy: [{ startsAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          startsAt: true,
          endsAt: true,
          questionCount: true,
          _count: { select: { participants: true } },
        },
      }),
    ]);
    const items: AdminContestDto[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      participantCount: row._count.participants,
      questionCount: row.questionCount,
    }));
    return {
      items,
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async participants(
    id: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items: ContestParticipantAdminDto[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const contest = await this.prisma.contest.findUnique({ where: { id }, select: { id: true } });
    if (!contest) {
      throw new AdminNotFoundError('Contest not found.');
    }
    const [total, rows] = await Promise.all([
      this.prisma.contestParticipant.count({ where: { contestId: id } }),
      this.prisma.contestParticipant.findMany({
        where: { contestId: id },
        orderBy: [{ registeredAt: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          userId: true,
          status: true,
          submittedAt: true,
          user: { select: { username: true, displayName: true } },
          result: { select: { score: true, rank: true } },
        },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        userId: row.userId,
        username: row.user.username,
        displayName: row.user.displayName,
        status: row.status,
        score: row.result?.score ?? null,
        rank: row.result?.rank ?? null,
        submittedAt: row.submittedAt?.toISOString() ?? null,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async suspicious(
    id: string,
    page: number,
    pageSize: number,
  ): Promise<{
    items: Array<{
      id: string;
      type: string;
      detail: string | null;
      userId: string | null;
      createdAt: string;
    }>;
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const contest = await this.prisma.contest.findUnique({ where: { id }, select: { id: true } });
    if (!contest) {
      throw new AdminNotFoundError('Contest not found.');
    }
    const [total, rows] = await Promise.all([
      this.prisma.contestSuspiciousEvent.count({ where: { contestId: id } }),
      this.prisma.contestSuspiciousEvent.findMany({
        where: { contestId: id },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, type: true, detail: true, createdAt: true, userId: true },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        detail: row.detail,
        userId: row.userId,
        createdAt: row.createdAt.toISOString(),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async updateMeta(
    id: string,
    input: AdminContestPatchInput,
    caller: AdminCaller,
    ip?: string,
  ): Promise<{ id: string; title: string; status: string }> {
    const previous = await this.prisma.contest.findUnique({
      where: { id },
      select: { status: true, title: true, description: true, rules: true },
    });
    if (!previous) {
      throw new AdminNotFoundError('Contest not found.');
    }
    // Metadata correction is only safe before the contest runs.
    if (previous.status !== 'DRAFT' && previous.status !== 'PUBLISHED') {
      throw new AdminConflictError('Metadata can only be corrected before a contest starts.');
    }
    const updated = await this.prisma.contest.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.rules !== undefined ? { rules: input.rules } : {}),
      },
      select: { id: true, title: true, status: true },
    });
    await this.audit.log({
      actorUserId: caller.id,
      action: 'contest.update',
      targetType: 'CONTEST',
      targetId: id,
      previousValue: {
        title: previous.title,
        description: previous.description,
        rules: previous.rules,
      },
      newValue: input,
      ip,
    });
    return updated;
  }

  async cancel(
    id: string,
    reason: string,
    caller: AdminCaller,
    ip?: string,
  ): Promise<{ id: string; status: string }> {
    const previous = await this.prisma.contest.findUnique({
      where: { id },
      select: { status: true, title: true },
    });
    if (!previous) {
      throw new AdminNotFoundError('Contest not found.');
    }
    if (previous.status === 'CANCELLED') {
      return { id, status: 'CANCELLED' as const };
    }
    if (previous.status === 'ENDED' || previous.status === 'ARCHIVED') {
      throw new AdminConflictError('Finished contests cannot be cancelled.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.contest.update({
        where: { id },
        data: { status: 'CANCELLED', endedAt: new Date() },
        select: { id: true, status: true },
      });
      await tx.adminAuditLog.create({
        data: {
          actorUserId: caller.id,
          action: 'contest.cancel',
          targetType: 'CONTEST',
          targetId: id,
          previousValue: { status: previous.status } as object,
          newValue: { status: 'CANCELLED' } as object,
          reason: reason.slice(0, 500),
          ip: ip ?? null,
        },
      });
      return row;
    });
    const participants = await this.prisma.contestParticipant.findMany({
      where: { contestId: id },
      select: { userId: true },
      take: 5000,
    });
    for (const participant of participants) {
      void this.events
        .notifyUser({
          userId: participant.userId,
          type: 'CONTEST_CANCELLED',
          title: `Contest cancelled: ${previous.title.slice(0, 120)}`,
          body: reason.slice(0, 500),
        })
        .catch(() => undefined);
    }
    return updated;
  }
}
