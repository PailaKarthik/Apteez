import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import type { CursorPage, ProblemDetailDto, ProblemSummaryDto } from '@apteez/types';
import type { ProblemListQuery } from '@apteez/validation';
import { AuthRequiredError } from '../auth/auth.errors';
import {
  cursorMatchesSort,
  decodeProblemCursor,
  encodeProblemCursor,
  type ProblemCursor,
} from './problem-cursor';
import {
  ProblemMapper,
  type ProblemDetailRow,
  type ProblemListRow,
  type ProblemStats,
  type ProblemUserState,
} from './problem-mapper';

interface StatsRow {
  id: string;
  has_explanation: boolean;
  has_shortcut: boolean;
  attempts: number;
  correct: number;
  solvers: number;
}

interface UserStatsRow {
  problem_id: string;
  attempts: number;
  correct: number;
  incorrect: number;
  solved: number;
  avg_time: number | null;
  last_attempt: Date | null;
}

export interface ProblemUserStats {
  solved: boolean;
  attemptCount: number;
  correctCount: number;
  incorrectCount: number;
  personalAccuracy: number | null;
  averageTimeSeconds: number | null;
  lastAttemptAt: string | null;
}

const LIST_SELECT = {
  id: true,
  title: true,
  contentMode: true,
  difficulty: true,
  rating: true,
  createdAt: true,
  publishedAt: true,
  category: { select: { name: true, slug: true } },
  topic: { select: { name: true, slug: true } },
  subtopic: { select: { name: true, slug: true } },
  exams: { select: { examTag: { select: { name: true, slug: true } } } },
  _count: { select: { options: true } },
} satisfies Prisma.ProblemSelect;

/**
 * Public read side of the question engine: discovery, filtering, cursor
 * pagination and detail. Only PUBLISHED problems are ever visible here, and
 * correct answers are excluded at the query layer, not filtered afterwards.
 *
 * Administrative writes live in the future AdminModule — this service is
 * deliberately read-only.
 */
@Injectable()
export class ProblemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: ProblemMapper,
  ) {}

  async list(query: ProblemListQuery, userId?: string): Promise<CursorPage<ProblemSummaryDto>> {
    if ((query.solved !== undefined || query.favorited !== undefined) && !userId) {
      throw new AuthRequiredError('Sign in to filter problems by your solved or favorite state.');
    }

    let cursor: ProblemCursor | null = null;
    if (query.cursor) {
      cursor = decodeProblemCursor(query.cursor);
      if (!cursor || !cursorMatchesSort(cursor, query.sort)) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: [{ field: 'cursor', message: 'Cursor is invalid for this sort order' }],
        });
      }
    }

    const rows = (await this.prisma.problem.findMany({
      where: this.buildWhere(query, userId, cursor),
      orderBy: this.buildOrderBy(query.sort),
      take: query.limit + 1,
      select: LIST_SELECT,
    })) as ProblemListRow[];

    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const ids = page.map((row) => row.id);

    const stats = await this.loadStats(ids);
    const state = userId ? await this.loadUserState(userId, ids) : undefined;
    const emptyStats: ProblemStats = {
      attemptCount: 0,
      correctCount: 0,
      solvedCount: 0,
      hasExplanation: false,
      hasShortcut: false,
    };

    const items = await Promise.all(
      page.map((row) => this.mapper.toSummary(row, stats.get(row.id) ?? emptyStats, state)),
    );

    const last = page.at(-1);
    return {
      items,
      hasNextPage,
      nextCursor:
        hasNextPage && last ? encodeProblemCursor(this.cursorFromRow(last, query.sort)) : null,
    };
  }

  /**
   * Total matching problems for the current list filters. Reuses the exact
   * same predicate builder as `list` (minus the cursor), so the Home library
   * header count can never disagree with the rows. Same auth rule: solved /
   * favorited filters require a signed-in caller.
   */
  async count(query: ProblemListQuery, userId?: string): Promise<{ total: number }> {
    if ((query.solved !== undefined || query.favorited !== undefined) && !userId) {
      throw new AuthRequiredError('Sign in to filter problems by your solved or favorite state.');
    }
    const total = await this.prisma.problem.count({
      where: this.buildWhere(query, userId, null),
    });
    return { total };
  }

  /**
   * Batched per-user attempt summary for a page of problems — one aggregate
   * query instead of a per-card lookup (N+1 guard).
   */
  async userStatsForProblems(
    userId: string,
    ids: string[],
  ): Promise<Map<string, ProblemUserStats>> {
    const map = new Map<string, ProblemUserStats>();
    if (ids.length === 0) {
      return map;
    }
    const rows = await this.prisma.$queryRaw<UserStatsRow[]>(Prisma.sql`
      SELECT "problemId" AS problem_id,
             COUNT(*) FILTER (WHERE "status" = 'SUBMITTED')::int AS attempts,
             COUNT(*) FILTER (WHERE "status" = 'SUBMITTED' AND "isCorrect")::int AS correct,
             COUNT(*) FILTER (WHERE "status" = 'SUBMITTED' AND "isCorrect" = false)::int AS incorrect,
             COUNT(*) FILTER (WHERE "status" = 'SUBMITTED' AND "isCorrect")::int AS solved,
             AVG("timeSpentSeconds") FILTER (WHERE "status" = 'SUBMITTED' AND "timeSpentSeconds" IS NOT NULL) AS avg_time,
             MAX("submittedAt") AS last_attempt
      FROM "submissions"
      WHERE "userId" = ${userId}::uuid
        AND "problemId" = ANY(${ids}::uuid[])
      GROUP BY "problemId"
    `);
    // Contest solves count as solved too (attempts/accuracy stay practice-only).
    const contestSolved = await this.prisma.contestAnswer.findMany({
      where: {
        userId,
        isCorrect: true,
        contestQuestion: { problemId: { in: ids } },
      },
      select: { contestQuestion: { select: { problemId: true } } },
    });
    const contestSolvedIds = new Set(contestSolved.map((row) => row.contestQuestion.problemId));
    for (const row of rows) {
      const attempts = Number(row.attempts);
      const correct = Number(row.correct);
      map.set(row.problem_id, {
        solved: Number(row.solved) > 0 || contestSolvedIds.has(row.problem_id),
        attemptCount: attempts,
        correctCount: correct,
        incorrectCount: Number(row.incorrect),
        personalAccuracy: attempts === 0 ? null : Math.round((correct / attempts) * 100),
        averageTimeSeconds: row.avg_time === null ? null : Math.round(Number(row.avg_time)),
        lastAttemptAt: row.last_attempt ? new Date(row.last_attempt).toISOString() : null,
      });
    }
    // Problems solved ONLY in contests have no submission row at all.
    for (const problemId of contestSolvedIds) {
      if (!map.has(problemId)) {
        map.set(problemId, {
          solved: true,
          attemptCount: 0,
          correctCount: 0,
          incorrectCount: 0,
          personalAccuracy: null,
          averageTimeSeconds: null,
          lastAttemptAt: null,
        });
      }
    }
    return map;
  }

  /**
   * Deterministic "next problem": the next published problem after this one
   * in the same topic (by creation order), wrapping to the oldest in the
   * topic at the end, and falling back to newest overall for single-problem
   * topics. Query-backed — never a client-side dataset.
   */
  async nextProblem(currentId: string): Promise<{ id: string } | null> {
    const current = await this.prisma.problem.findFirst({
      where: { id: currentId, status: 'PUBLISHED' },
      select: { topicId: true, createdAt: true },
    });
    if (!current) {
      return null;
    }
    // Next-newer in the same topic (creation order, id as tie-break).
    const newer = await this.prisma.problem.findFirst({
      where: {
        status: 'PUBLISHED',
        topicId: current.topicId,
        id: { not: currentId },
        OR: [
          { createdAt: { gt: current.createdAt } },
          { createdAt: current.createdAt, id: { gt: currentId } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (newer) {
      return newer;
    }
    // End of the topic: wrap to its oldest so Next never dead-ends.
    const wrap = await this.prisma.problem.findFirst({
      where: {
        status: 'PUBLISHED',
        topicId: current.topicId,
        id: { not: currentId },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    if (wrap) {
      return wrap;
    }
    return this.prisma.problem.findFirst({
      where: { status: 'PUBLISHED', id: { not: currentId } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
  }

  /**
   * Batched summary projection for an explicit set of problem ids. Reuses the
   * single-query stats loader and the two-query user-state loader, so a
   * favorites page with many problems never issues per-row queries. Only
   * PUBLISHED problems are returned.
   */
  async summarizeProblems(
    userId: string | undefined,
    ids: string[],
  ): Promise<Map<string, ProblemSummaryDto>> {
    const result = new Map<string, ProblemSummaryDto>();
    if (ids.length === 0) {
      return result;
    }
    const rows = (await this.prisma.problem.findMany({
      where: { id: { in: ids }, status: 'PUBLISHED' },
      select: LIST_SELECT,
    })) as ProblemListRow[];

    const rowIds = rows.map((row) => row.id);
    const stats = await this.loadStats(rowIds);
    const state = userId ? await this.loadUserState(userId, rowIds) : undefined;
    const emptyStats: ProblemStats = {
      attemptCount: 0,
      correctCount: 0,
      solvedCount: 0,
      hasExplanation: false,
      hasShortcut: false,
    };
    const summaries = await Promise.all(
      rows.map((row) => this.mapper.toSummary(row, stats.get(row.id) ?? emptyStats, state)),
    );
    for (const summary of summaries) {
      result.set(summary.id, summary);
    }
    return result;
  }

  async getById(id: string, userId?: string): Promise<ProblemDetailDto> {
    const row = (await this.prisma.problem.findFirst({
      where: { id, status: 'PUBLISHED' },
      select: {
        ...LIST_SELECT,
        statement: true,
        explanation: true,
        shortcut: true,
        source: true,
        sourceYear: true,
        assets: {
          select: {
            id: true,
            kind: true,
            objectKey: true,
            mimeType: true,
            position: true,
            altText: true,
          },
          orderBy: { position: 'asc' },
        },
        // isCorrect is intentionally not selected: the public detail response
        // can never carry the answer.
        options: {
          select: { id: true, position: true, text: true, assetKey: true },
          orderBy: { position: 'asc' },
        },
      },
    })) as ProblemDetailRow | null;

    if (!row) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'Problem not found.',
      });
    }

    const stats = await this.loadStats([row.id]);
    const state = userId ? await this.loadUserState(userId, [row.id]) : undefined;
    return this.mapper.toDetail(
      row,
      stats.get(row.id) ?? {
        attemptCount: 0,
        correctCount: 0,
        solvedCount: 0,
        hasExplanation: false,
        hasShortcut: false,
      },
      state,
    );
  }

  private buildWhere(
    query: ProblemListQuery,
    userId: string | undefined,
    cursor: ProblemCursor | null,
  ): Prisma.ProblemWhereInput {
    const and: Prisma.ProblemWhereInput[] = [{ status: 'PUBLISHED' }];

    if (query.category) {
      and.push({ category: { slug: query.category } });
    }
    if (query.topic) {
      and.push({ topic: { slug: query.topic } });
    }
    if (query.subtopic) {
      and.push({ subtopic: { slug: query.subtopic } });
    }
    if (query.difficulty) {
      and.push({ difficulty: query.difficulty });
    }
    if (query.ratingMin !== undefined || query.ratingMax !== undefined) {
      and.push({
        rating: {
          ...(query.ratingMin !== undefined ? { gte: query.ratingMin } : {}),
          ...(query.ratingMax !== undefined ? { lte: query.ratingMax } : {}),
        },
      });
    }
    if (query.exam) {
      and.push({ exams: { some: { examTag: { slug: query.exam } } } });
    }
    if (query.search) {
      const term = query.search;
      and.push({
        OR: [
          { title: { contains: term, mode: 'insensitive' } },
          { statement: { contains: term, mode: 'insensitive' } },
          { topic: { is: { name: { contains: term, mode: 'insensitive' } } } },
          { category: { is: { name: { contains: term, mode: 'insensitive' } } } },
        ],
      });
    }

    if (userId) {
      // Solved anywhere: practice submissions OR correct contest answers.
      const solved: Prisma.ProblemWhereInput = {
        OR: [
          { submissions: { some: { userId, isCorrect: true } } },
          {
            contestQuestions: {
              some: { answers: { some: { userId, isCorrect: true } } },
            },
          },
        ],
      };
      const favorited: Prisma.ProblemWhereInput = {
        favorites: { some: { collection: { ownerId: userId } } },
      };
      if (query.solved === true) {
        and.push(solved);
      } else if (query.solved === false) {
        and.push({
          submissions: { none: { userId, isCorrect: true } },
          contestQuestions: { none: { answers: { some: { userId, isCorrect: true } } } },
        });
      }
      if (query.favorited === true) {
        and.push(favorited);
      } else if (query.favorited === false) {
        and.push({ favorites: { none: { collection: { ownerId: userId } } } });
      }
    }

    if (cursor) {
      and.push(this.cursorKeyset(cursor, query.sort));
    }

    return { AND: and };
  }

  /** Keyset predicate: strictly "after" the last row in the sort order. */
  private cursorKeyset(
    cursor: ProblemCursor,
    sort: ProblemListQuery['sort'],
  ): Prisma.ProblemWhereInput {
    const id = cursor.id;
    switch (sort) {
      case 'rating_desc': {
        const value = cursor.value as number;
        return { OR: [{ rating: { lt: value } }, { rating: value, id: { lt: id } }] };
      }
      case 'rating_asc': {
        const value = cursor.value as number;
        return { OR: [{ rating: { gt: value } }, { rating: value, id: { gt: id } }] };
      }
      case 'oldest': {
        const value = new Date(cursor.value as string);
        return { OR: [{ createdAt: { gt: value } }, { createdAt: value, id: { gt: id } }] };
      }
      default: {
        const value = new Date(cursor.value as string);
        return { OR: [{ createdAt: { lt: value } }, { createdAt: value, id: { lt: id } }] };
      }
    }
  }

  /** Stable secondary key on every sort prevents pagination drift. */
  private buildOrderBy(sort: ProblemListQuery['sort']): Prisma.ProblemOrderByWithRelationInput[] {
    switch (sort) {
      case 'oldest':
        return [{ createdAt: 'asc' }, { id: 'asc' }];
      case 'rating_desc':
        return [{ rating: 'desc' }, { id: 'desc' }];
      case 'rating_asc':
        return [{ rating: 'asc' }, { id: 'asc' }];
      default:
        return [{ createdAt: 'desc' }, { id: 'desc' }];
    }
  }

  private cursorFromRow(row: ProblemListRow, sort: ProblemListQuery['sort']): ProblemCursor {
    if (sort === 'rating_desc' || sort === 'rating_asc') {
      return { value: row.rating, id: row.id };
    }
    return { value: row.createdAt.toISOString(), id: row.id };
  }

  /**
   * One aggregate query for the whole page: attempt/accuracy stats plus the
   * explanation/shortcut availability flags (so list views never read the
   * long text columns at all).
   */
  private async loadStats(ids: string[]): Promise<Map<string, ProblemStats>> {
    const map = new Map<string, ProblemStats>();
    if (ids.length === 0) {
      return map;
    }
    const rows = await this.prisma.$queryRaw<StatsRow[]>(Prisma.sql`
      SELECT p.id AS id,
             (p."explanation" IS NOT NULL) AS has_explanation,
             (p."shortcut" IS NOT NULL) AS has_shortcut,
             COALESCE(s.attempts, 0)::int AS attempts,
             COALESCE(s.correct, 0)::int AS correct,
             COALESCE(s.solvers, 0)::int AS solvers
      FROM "problems" p
      LEFT JOIN (
        SELECT "problemId" AS problem_id,
               COUNT(*)::int AS attempts,
               COUNT(*) FILTER (WHERE "isCorrect")::int AS correct,
               COUNT(DISTINCT "userId") FILTER (WHERE "isCorrect")::int AS solvers
        FROM "submissions"
        WHERE "problemId" = ANY(${ids}::uuid[])
          AND "status" = 'SUBMITTED'
        GROUP BY "problemId"
      ) s ON s.problem_id = p.id
      WHERE p.id = ANY(${ids}::uuid[])
    `);
    for (const row of rows) {
      map.set(row.id, {
        attemptCount: Number(row.attempts),
        correctCount: Number(row.correct),
        solvedCount: Number(row.solvers),
        hasExplanation: Boolean(row.has_explanation),
        hasShortcut: Boolean(row.has_shortcut),
      });
    }
    return map;
  }

  /** Two batched queries (solved + favorited) — never one per problem. */
  private async loadUserState(userId: string, ids: string[]): Promise<ProblemUserState> {
    if (ids.length === 0) {
      return { solvedIds: new Set(), favoritedIds: new Set() };
    }
    const [solved, contestSolved, favorited] = await Promise.all([
      this.prisma.submission.findMany({
        where: { userId, problemId: { in: ids }, status: 'SUBMITTED', isCorrect: true },
        select: { problemId: true },
        distinct: ['problemId'],
      }),
      // Correct contest answers solve the problem in the library too.
      this.prisma.contestAnswer.findMany({
        where: {
          userId,
          isCorrect: true,
          contestQuestion: { problemId: { in: ids } },
        },
        select: { contestQuestion: { select: { problemId: true } } },
      }),
      this.prisma.favoriteCollectionItem.findMany({
        where: { problemId: { in: ids }, collection: { ownerId: userId } },
        select: { problemId: true },
      }),
    ]);
    return {
      solvedIds: new Set([
        ...solved.map((row) => row.problemId),
        ...contestSolved.map((row) => row.contestQuestion.problemId),
      ]),
      favoritedIds: new Set(favorited.map((row) => row.problemId)),
    };
  }
}
