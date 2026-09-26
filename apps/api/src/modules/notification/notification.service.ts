import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { NotificationDto, PaginatedData } from '@apteez/types';
import type { NotificationListQuery } from '@apteez/validation';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: NotificationListQuery,
  ): Promise<PaginatedData<NotificationDto>> {
    const where = { userId, ...(query.unreadOnly ? { isRead: false } : {}) };
    const [total, rows] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((n) => ({
        id: n.id,
        type: n.type as NotificationDto['type'],
        title: n.title,
        body: n.body,
        eventId: n.eventId,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    const unread = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { unread };
  }

  async markRead(userId: string, id: string): Promise<{ read: boolean }> {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    return { read: true };
  }

  async markAllRead(userId: string): Promise<{ read: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { read: result.count };
  }
}
