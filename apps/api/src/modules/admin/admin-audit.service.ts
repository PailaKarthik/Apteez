import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { AuditLogDto } from '@apteez/types';
import type { AuditLogsQuery } from '@apteez/validation';
import { AppLogger } from '../../common/logger/app-logger';

export interface AuditRecord {
  actorUserId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ip?: string | null;
}

/**
 * Append-only audit trail. There is deliberately no update or delete path:
 * rows are written inside the same transaction as the domain mutation where
 * it matters, and reads are paginated/filtered only.
 */
@Injectable()
export class AdminAuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  async log(record: AuditRecord): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          actorUserId: record.actorUserId,
          action: record.action,
          targetType: record.targetType ?? null,
          targetId: record.targetId ?? null,
          previousValue: (record.previousValue ?? undefined) as object | undefined,
          newValue: (record.newValue ?? undefined) as object | undefined,
          reason: record.reason ?? null,
          ip: record.ip ?? null,
        },
      });
    } catch (error) {
      // Audit failure must never roll back the domain mutation it records.
      this.logger.warn(
        `admin.audit-failed action=${record.action} ${error instanceof Error ? error.message : String(error)}`,
        'Admin',
      );
    }
  }

  async list(query: AuditLogsQuery): Promise<{
    items: AuditLogDto[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const where = {
      ...(query.actorId ? { actorUserId: query.actorId } : {}),
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' as const } } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { actor: { select: { id: true, username: true, displayName: true } } },
      }),
    ]);
    return {
      items: rows.map((row) => ({
        id: row.id,
        actor: {
          id: row.actor.id,
          username: row.actor.username,
          displayName: row.actor.displayName,
        },
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        previousValue: (row.previousValue ?? null) as unknown,
        newValue: (row.newValue ?? null) as unknown,
        reason: row.reason,
        ip: row.ip,
        createdAt: row.createdAt.toISOString(),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }
}
