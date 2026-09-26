import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { FeedbackDto } from '@apteez/types';
import type {
  AdminFeedbackUpdateInput,
  FeedbackQuery,
  FeedbackSubmitInput,
} from '@apteez/validation';
import { AppError } from '../../common/errors/app-error';

export class FeedbackNotFoundError extends AppError {
  constructor(message = 'Feedback not found.') {
    super('NOT_FOUND', message, 404);
    this.name = 'FeedbackNotFoundError';
  }
}

const REPORTER_SELECT = {
  id: true,
  username: true,
  displayName: true,
} as const;

type FeedbackRow = {
  id: string;
  category: string;
  description: string;
  page: string | null;
  status: string;
  priority: string;
  createdAt: Date;
  resolvedAt: Date | null;
  user: { id: string; username: string | null; displayName: string } | null;
};

/**
 * Lightweight user-feedback intake for launch operations. Anyone (including
 * anonymous visitors) can file; only staff triage. Descriptions are bounded
 * plain text and reporter identity is trimmed in admin reads — this is an
 * ops queue, not a support platform and never a PII store.
 */
@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async submit(userId: string | undefined, input: FeedbackSubmitInput): Promise<{ id: string }> {
    const created = await this.prisma.feedback.create({
      data: {
        userId: userId ?? null,
        category: input.category,
        description: input.description,
        page: input.page ?? null,
        status: 'OPEN',
        priority: 'MEDIUM',
      },
      select: { id: true },
    });
    return { id: created.id };
  }

  async mine(userId: string): Promise<{ items: FeedbackDto[] }> {
    const rows = await this.prisma.feedback.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
      include: { user: { select: REPORTER_SELECT } },
    });
    return { items: rows.map((row) => this.toDto(row as FeedbackRow)) };
  }

  async list(query: FeedbackQuery): Promise<{
    items: FeedbackDto[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.feedback.count({ where }),
      this.prisma.feedback.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { user: { select: REPORTER_SELECT } },
      }),
    ]);
    return {
      items: rows.map((row) => this.toDto(row as FeedbackRow)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async update(
    id: string,
    input: AdminFeedbackUpdateInput,
  ): Promise<{ dto: FeedbackDto; changed: boolean }> {
    const existing = await this.prisma.feedback.findUnique({
      where: { id },
      select: { id: true, status: true, priority: true },
    });
    if (!existing) {
      throw new FeedbackNotFoundError();
    }
    const data: { status?: string; priority?: string; resolvedAt?: Date | null } = {};
    if (input.status && input.status !== existing.status) {
      data.status = input.status;
      data.resolvedAt =
        input.status === 'RESOLVED' || input.status === 'DISMISSED' ? new Date() : null;
    }
    if (input.priority && input.priority !== existing.priority) {
      data.priority = input.priority;
    }
    if (Object.keys(data).length === 0) {
      const row = await this.prisma.feedback.findUnique({
        where: { id },
        include: { user: { select: REPORTER_SELECT } },
      });
      return { dto: this.toDto(row as unknown as FeedbackRow), changed: false };
    }
    const updated = await this.prisma.feedback.update({
      where: { id },
      data,
      include: { user: { select: REPORTER_SELECT } },
    });
    return { dto: this.toDto(updated as unknown as FeedbackRow), changed: true };
  }

  private toDto(row: FeedbackRow): FeedbackDto {
    return {
      id: row.id,
      reporter: row.user
        ? { id: row.user.id, username: row.user.username, displayName: row.user.displayName }
        : null,
      category: row.category,
      description: row.description,
      page: row.page,
      status: row.status,
      priority: row.priority,
      createdAt: row.createdAt.toISOString(),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
    };
  }
}
