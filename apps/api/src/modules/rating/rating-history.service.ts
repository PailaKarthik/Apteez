import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { Prisma } from '@apteez/database';
import type { CursorPage, RatingHistoryEntryDto } from '@apteez/types';
import type { RatingHistoryQuery } from '@apteez/validation';
import { decodeProblemCursor, encodeProblemCursor } from '../problems/problem-cursor';

/**
 * Read side of rating history. Append-only rows produced by the rating engine;
 * this service only ever pages and filters them.
 */
@Injectable()
export class RatingHistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async page(
    userId: string,
    query: RatingHistoryQuery,
  ): Promise<CursorPage<RatingHistoryEntryDto>> {
    let cursor: { value: string | number; id: string } | null = null;
    if (query.cursor) {
      cursor = decodeProblemCursor(query.cursor);
      if (!cursor || typeof cursor.value !== 'string' || Number.isNaN(Date.parse(cursor.value))) {
        cursor = null;
      }
    }

    const where: Prisma.ChallengeRatingHistoryWhereInput = { userId };
    if (query.domain) {
      where.domainSlug = query.domain;
    }
    if (query.result) {
      where.result = query.result;
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      };
    }
    if (cursor) {
      const value = new Date(cursor.value as string);
      where.AND = [
        { OR: [{ createdAt: { lt: value } }, { createdAt: value, id: { lt: cursor.id } }] },
      ];
    }

    const rows = await this.prisma.challengeRatingHistory.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        category: { select: { name: true } },
        opponent: { select: { id: true, username: true, displayName: true, avatarKey: true } },
      },
    });

    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const items: RatingHistoryEntryDto[] = page.map((row) => ({
      id: row.id,
      challengeId: row.challengeId,
      domainSlug: row.domainSlug,
      domainName: row.category.name,
      result: row.result,
      outcome: row.outcome,
      score: row.score,
      opponentScore: row.opponentScore,
      ratingBefore: row.ratingBefore,
      ratingAfter: row.ratingAfter,
      ratingChange: row.ratingChange,
      opponent: row.opponent
        ? {
            id: row.opponent.id,
            username: row.opponent.username,
            displayName: row.opponent.displayName,
            avatarKey: row.opponent.avatarKey,
          }
        : null,
      createdAt: row.createdAt.toISOString(),
    }));

    const last = page.at(-1);
    return {
      items,
      hasNextPage,
      nextCursor:
        hasNextPage && last
          ? encodeProblemCursor({ value: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }
}
