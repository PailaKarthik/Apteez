import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import type { CursorPage, RecentSubmissionDto } from '@apteez/types';
import type { RecentSubmissionsQuery } from '@apteez/validation';
import { decodeProblemCursor, encodeProblemCursor } from '../problems/problem-cursor';

/**
 * Read side of the user's practice history. Returns lightweight rows only —
 * recent activity never ships full question bodies.
 */
@Injectable()
export class SubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async recent(
    userId: string,
    query: RecentSubmissionsQuery,
  ): Promise<CursorPage<RecentSubmissionDto>> {
    let cursor: { value: string | number; id: string } | null = null;
    if (query.cursor) {
      cursor = decodeProblemCursor(query.cursor);
      if (!cursor || typeof cursor.value !== 'string' || Number.isNaN(Date.parse(cursor.value))) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: [{ field: 'cursor', message: 'Cursor is invalid' }],
        });
      }
    }

    const keyset: Prisma.SubmissionWhereInput | null = cursor
      ? {
          OR: [
            { submittedAt: { lt: new Date(cursor.value as string) } },
            { submittedAt: new Date(cursor.value as string), id: { lt: cursor.id } },
          ],
        }
      : null;

    const rows = await this.prisma.submission.findMany({
      where: {
        userId,
        status: 'SUBMITTED',
        context: 'PRACTICE',
        ...(keyset ? { AND: [keyset] } : {}),
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      select: {
        id: true,
        isCorrect: true,
        timeSpentSeconds: true,
        submittedAt: true,
        problem: {
          select: {
            id: true,
            title: true,
            difficulty: true,
            category: { select: { name: true, slug: true } },
            topic: { select: { name: true, slug: true } },
          },
        },
      },
    });

    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;

    const items: RecentSubmissionDto[] = page.map((row) => ({
      id: row.id,
      problem: { id: row.problem.id, title: row.problem.title },
      category: row.problem.category,
      topic: row.problem.topic,
      difficulty: row.problem.difficulty,
      isCorrect: row.isCorrect ?? false,
      timeSpentSeconds: row.timeSpentSeconds,
      submittedAt: (row.submittedAt ?? new Date()).toISOString(),
    }));

    const last = page.at(-1);
    return {
      items,
      hasNextPage,
      nextCursor:
        hasNextPage && last && last.submittedAt
          ? encodeProblemCursor({ value: last.submittedAt.toISOString(), id: last.id })
          : null,
    };
  }
}
