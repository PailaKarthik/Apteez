import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { OffsetPage, RecentSubmissionDto } from '@apteez/types';
import type { RecentSubmissionsQuery } from '@apteez/validation';

/**
 * Read side of the user's practice history. Returns lightweight rows only —
 * recent activity never ships full question bodies. Offset-paginated:
 * finalized submissions never change, so skip/take stays consistent.
 */
@Injectable()
export class SubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async recent(
    userId: string,
    query: RecentSubmissionsQuery,
  ): Promise<OffsetPage<RecentSubmissionDto>> {
    const where = {
      userId,
      status: 'SUBMITTED',
      context: 'PRACTICE',
    } as const;
    const [total, rows] = await Promise.all([
      this.prisma.submission.count({ where }),
      this.prisma.submission.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        skip: query.offset,
        take: query.limit,
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
      }),
    ]);

    const items: RecentSubmissionDto[] = rows.map((row) => ({
      id: row.id,
      problem: { id: row.problem.id, title: row.problem.title },
      category: row.problem.category,
      topic: row.problem.topic,
      difficulty: row.problem.difficulty,
      isCorrect: row.isCorrect ?? false,
      timeSpentSeconds: row.timeSpentSeconds,
      submittedAt: (row.submittedAt ?? new Date()).toISOString(),
    }));

    return {
      items,
      total,
      offset: query.offset,
      limit: query.limit,
      hasMore: query.offset + items.length < total,
    };
  }
}
