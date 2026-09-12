import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import type {
  CursorPage,
  FavoriteMembershipDto,
  FavoriteProblemDto,
  ProblemSummaryDto,
} from '@apteez/types';
import type { FavoriteListQuery } from '@apteez/validation';
import { AppError } from '../../common/errors/app-error';
import {
  decodeProblemCursor,
  encodeProblemCursor,
  type ProblemCursor,
} from '../problems/problem-cursor';
import { ProblemsService } from '../problems/problems.service';
import { ensureDefaultCollectionId } from './favorites.util';

type FavoriteSort = FavoriteListQuery['sort'];

interface ItemRow {
  id: string;
  problemId: string;
  addedAt: Date;
}

/**
 * The heart action and the Favorites listing. Favorites is a normal
 * collection with system rules (see FavoriteCollectionsService), so storage
 * stays uniform while the UI keeps a dedicated button.
 *
 * SOLVED vs FAVORITED: favoriting never affects solved state; a problem is
 * "favorited" when it belongs to the caller's default Favorites collection.
 */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly problems: ProblemsService,
  ) {}

  /** Idempotent toggle: returns the resulting favorite state. */
  async toggle(userId: string, problemId: string): Promise<{ favorited: boolean }> {
    await this.requirePublishedProblem(problemId);
    const collectionId = await ensureDefaultCollectionId(this.prisma, userId);
    const existing = await this.prisma.favoriteCollectionItem.findUnique({
      where: { collectionId_problemId: { collectionId, problemId } },
      select: { id: true },
    });
    if (existing) {
      // deleteMany keeps this idempotent under concurrent removals.
      await this.prisma.favoriteCollectionItem.deleteMany({ where: { collectionId, problemId } });
      return { favorited: false };
    }
    await this.addMembership(collectionId, problemId);
    return { favorited: true };
  }

  /**
   * Insert a membership, tolerating the concurrent-insert unique race: when
   * two requests add the same problem at once, one wins and the other sees
   * P2002 — the desired end state (a single row) already holds, so it is a
   * success rather than a 500.
   */
  private async addMembership(collectionId: string, problemId: string): Promise<void> {
    try {
      await this.prisma.favoriteCollectionItem.create({ data: { collectionId, problemId } });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
        throw error;
      }
    }
  }

  /** Idempotent add (repeated calls are no-ops). */
  async add(userId: string, problemId: string): Promise<{ favorited: true }> {
    await this.requirePublishedProblem(problemId);
    const collectionId = await ensureDefaultCollectionId(this.prisma, userId);
    await this.addMembership(collectionId, problemId);
    return { favorited: true };
  }

  /** Idempotent remove — missing membership is still a success. */
  async remove(userId: string, problemId: string): Promise<{ favorited: false }> {
    const collectionId = await ensureDefaultCollectionId(this.prisma, userId);
    await this.prisma.favoriteCollectionItem.deleteMany({ where: { collectionId, problemId } });
    return { favorited: false };
  }

  async list(userId: string, query: FavoriteListQuery): Promise<CursorPage<FavoriteProblemDto>> {
    const collectionId = await ensureDefaultCollectionId(this.prisma, userId);
    return this.listCollectionItems(userId, collectionId, query);
  }

  /** Which of the caller's collections contain each problem (one query). */
  async membership(userId: string, problemIds: string[]): Promise<FavoriteMembershipDto[]> {
    if (problemIds.length === 0) {
      return [];
    }
    const rows = await this.prisma.favoriteCollectionItem.findMany({
      where: { problemId: { in: problemIds }, collection: { ownerId: userId } },
      select: { problemId: true, collectionId: true, collection: { select: { isDefault: true } } },
    });
    const byProblem = new Map<string, string[]>();
    const favorites = new Set<string>();
    for (const row of rows) {
      const list = byProblem.get(row.problemId) ?? [];
      list.push(row.collectionId);
      byProblem.set(row.problemId, list);
      if (row.collection.isDefault) {
        favorites.add(row.problemId);
      }
    }
    return problemIds.map((problemId) => ({
      problemId,
      collectionIds: byProblem.get(problemId) ?? [],
      isFavorited: favorites.has(problemId),
    }));
  }

  /**
   * Shared paginated listing over a collection's items. Reused by both the
   * Favorites endpoint and custom collections so ordering/cursor semantics
   * never diverge. Only PUBLISHED problems surface; archived items stay in
   * the collection but are hidden from public reads.
   */
  async listCollectionItems(
    userId: string,
    collectionId: string,
    query: FavoriteListQuery,
  ): Promise<CursorPage<FavoriteProblemDto>> {
    const sort = query.sort;
    let cursor: ProblemCursor | null = null;
    if (query.cursor) {
      cursor = decodeProblemCursor(query.cursor);
      if (!cursor || !this.cursorMatchesSort(cursor, sort)) {
        throw new AppError('VALIDATION_ERROR', 'Cursor is invalid for this sort order.', 400, [
          { field: 'cursor', message: 'Cursor is invalid for this sort order' },
        ]);
      }
    }

    const where: Prisma.FavoriteCollectionItemWhereInput = { collectionId };
    if (cursor) {
      where.AND = [this.cursorKeyset(cursor, sort)];
    }

    const rows = (await this.prisma.favoriteCollectionItem.findMany({
      where,
      orderBy: this.itemOrderBy(sort),
      take: query.limit + 1,
      select: { id: true, problemId: true, addedAt: true },
    })) as ItemRow[];

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const summaries = await this.problems.summarizeProblems(
      userId,
      page.map((row) => row.problemId),
    );

    const items: FavoriteProblemDto[] = [];
    for (const row of page) {
      const summary: ProblemSummaryDto | undefined = summaries.get(row.problemId);
      if (summary) {
        items.push({ ...summary, addedAt: row.addedAt.toISOString() });
      }
    }

    const last = page.at(-1);
    return {
      items,
      hasNextPage: hasMore,
      nextCursor:
        hasMore && last ? encodeProblemCursor(this.cursorFromItem(last, sort, summaries)) : null,
    };
  }

  private cursorMatchesSort(cursor: ProblemCursor, sort: FavoriteSort): boolean {
    if (sort === 'rating_desc' || sort === 'rating_asc') {
      return typeof cursor.value === 'number' && Number.isFinite(cursor.value);
    }
    if (sort === 'title_asc') {
      return typeof cursor.value === 'string';
    }
    return typeof cursor.value === 'string' && !Number.isNaN(Date.parse(cursor.value));
  }

  private cursorFromItem(
    item: ItemRow,
    sort: FavoriteSort,
    summaries: Map<string, ProblemSummaryDto>,
  ): ProblemCursor {
    if (sort === 'rating_desc' || sort === 'rating_asc') {
      return { value: summaries.get(item.problemId)?.rating ?? 0, id: item.id };
    }
    if (sort === 'title_asc') {
      return { value: summaries.get(item.problemId)?.title ?? '', id: item.id };
    }
    return { value: item.addedAt.toISOString(), id: item.id };
  }

  private cursorKeyset(
    cursor: ProblemCursor,
    sort: FavoriteSort,
  ): Prisma.FavoriteCollectionItemWhereInput {
    const id = cursor.id;
    switch (sort) {
      case 'added_asc': {
        const value = new Date(cursor.value as string);
        return { OR: [{ addedAt: { gt: value } }, { addedAt: value, id: { gt: id } }] };
      }
      case 'rating_desc': {
        const value = cursor.value as number;
        return {
          OR: [
            { problem: { rating: { lt: value } } },
            { problem: { rating: value }, id: { lt: id } },
          ],
        };
      }
      case 'rating_asc': {
        const value = cursor.value as number;
        return {
          OR: [
            { problem: { rating: { gt: value } } },
            { problem: { rating: value }, id: { gt: id } },
          ],
        };
      }
      case 'title_asc': {
        const value = cursor.value as string;
        return {
          OR: [
            { problem: { title: { gt: value } } },
            { problem: { title: value }, id: { gt: id } },
          ],
        };
      }
      default: {
        const value = new Date(cursor.value as string);
        return { OR: [{ addedAt: { lt: value } }, { addedAt: value, id: { lt: id } }] };
      }
    }
  }

  private itemOrderBy(sort: FavoriteSort): Prisma.FavoriteCollectionItemOrderByWithRelationInput[] {
    switch (sort) {
      case 'added_asc':
        return [{ addedAt: 'asc' }, { id: 'asc' }];
      case 'rating_desc':
        return [{ problem: { rating: 'desc' } }, { id: 'desc' }];
      case 'rating_asc':
        return [{ problem: { rating: 'asc' } }, { id: 'asc' }];
      case 'title_asc':
        return [{ problem: { title: 'asc' } }, { id: 'asc' }];
      default:
        return [{ addedAt: 'desc' }, { id: 'desc' }];
    }
  }

  async requirePublishedProblem(problemId: string): Promise<void> {
    const problem = await this.prisma.problem.findFirst({
      where: { id: problemId, status: 'PUBLISHED' },
      select: { id: true },
    });
    if (!problem) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Problem not found.',
      });
    }
  }
}
