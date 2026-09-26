import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, PrismaService } from '@apteez/database';
import type {
  ContestSummaryDto,
  DiscussionThreadSummaryDto,
  EventSummaryDto,
  LearningSearchResultDto,
  ProblemFilterMetadataDto,
  ProblemSummaryDto,
  RecentSearchDto,
  SearchSuggestionsDto,
  TopicSearchResultDto,
  TrendingContentDto,
} from '@apteez/types';
import type { SearchAnalyticsInput, SearchQuery } from '@apteez/validation';
import { AppLogger } from '../../common/logger/app-logger';
import { RedisService } from '../../redis/redis.service';
import { redisKeys } from '../../redis/redis-keys';
import { ProblemsService } from '../problems/problems.service';
import { InvalidSearchCursorError } from './search.errors';
import {
  RANK_TIER,
  TRIGRAM_THRESHOLD,
  decodeSearchCursor,
  encodeSearchCursor,
  fingerprintInput,
  fingerprintQuery,
  normalizeQuery,
} from './search-ranking.util';

const SUGGEST_TTL_SECONDS = 60;
const TRENDING_TTL_SECONDS = 300;
const FILTERS_TTL_SECONDS = 600;

interface RankedRow {
  id: string;
  rank: number;
}

/**
 * Dedicated lexical search layer. Problems use a parameterized raw-SQL
 * ladder (exact id → exact title → prefix → full-text ts_rank → trigram →
 * topic/exam) over indexed columns; every other type uses selective Prisma
 * queries that only ever touch PUBLISHED/visible rows. Ranking stays
 * deterministic and explainable; semantic retrieval will live behind
 * SimilarProblemService without touching this file's contracts.
 */
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly problems: ProblemsService,
    private readonly redis: RedisService,
    private readonly logger: AppLogger,
  ) {}

  // ─── Unified search ───────────────────────────────────────────────────

  async search(query: SearchQuery, userId?: string): Promise<Record<string, unknown>> {
    const q = query.q.trim();
    if (query.type === 'all') {
      const [problems, topics, learning, contests, events, discussions] = await Promise.all([
        this.searchProblems({ ...query, q, limit: 10 }, userId, 0).then((page) => page.items),
        this.searchTopics(q, 5),
        this.searchLearning(q, 8),
        this.searchContests(q, userId, 5, 0).then((page) => page.items),
        this.searchEvents(q, userId, 5, 0).then((page) => page.items),
        this.searchDiscussions(q, 5, 0).then((page) => page.items),
      ]);
      return { q, problems, topics, learning, contests, events, discussions };
    }
    const { offset, fingerprint } = this.resolveCursor(query, q);
    switch (query.type) {
      case 'PROBLEM':
        return this.searchProblems({ ...query, q }, userId, offset, fingerprint);
      case 'TOPIC':
        return this.searchTopics(q, query.limit, offset, fingerprint);
      case 'LEARNING':
        return this.searchLearning(q, query.limit, offset, fingerprint);
      case 'CONTEST':
        return this.searchContests(q, userId, query.limit, offset, fingerprint);
      case 'EVENT':
        return this.searchEvents(q, userId, query.limit, offset, fingerprint);
      case 'DISCUSSION':
        return this.searchDiscussions(q, query.limit, offset, fingerprint);
    }
  }

  // ─── Problems (indexed, ranked) ───────────────────────────────────────

  async searchProblems(
    query: SearchQuery & { q: string },
    userId: string | undefined,
    offset: number,
    fingerprint?: string,
  ): Promise<{ items: ProblemSummaryDto[]; nextCursor: string | null; hasNextPage: boolean }> {
    const q = query.q;
    const prefix = `${q}%`;
    const contains = `%${q}%`;
    const filters = {
      topic: query.topic,
      difficulty: query.difficulty,
      ratingMin: query.ratingMin,
      ratingMax: query.ratingMax,
      exam: query.exam,
      solved: query.solved,
      favorited: query.favorited,
      sort: query.sort ?? 'relevance',
    };
    const print = fingerprint ?? fingerprintInput(q, filters);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);

    const solvedJoin =
      userId && query.solved !== undefined
        ? Prisma.sql`AND ${this.solvedPredicate(userId, query.solved)}`
        : Prisma.empty;
    const favoritedJoin =
      userId && query.favorited !== undefined
        ? Prisma.sql`AND ${this.favoritedPredicate(userId, query.favorited)}`
        : Prisma.empty;

    const orderBy =
      filters.sort === 'newest'
        ? Prisma.sql`p."createdAt" DESC, p."id" DESC`
        : filters.sort === 'rating'
          ? Prisma.sql`p."rating" DESC, p."id" DESC`
          : Prisma.sql`rank DESC, p."id" ASC`;

    const rows = await this.prisma.$queryRaw<RankedRow[]>`
      WITH q AS (SELECT plainto_tsquery('english', ${q}) AS tsq)
      SELECT p."id" AS id, (
        CASE WHEN ${isUuid} AND p."id"::text = ${q} THEN ${RANK_TIER.EXACT_ID}
             WHEN lower(p."title") = lower(${q}) THEN ${RANK_TIER.EXACT_TITLE}
             WHEN p."title" ILIKE ${prefix} THEN ${RANK_TIER.TITLE_PREFIX}
             ELSE 0 END
        + COALESCE(ts_rank(p."searchVector", (SELECT tsq FROM q)) * ${RANK_TIER.FULLTEXT_SCALE}, 0)
        + COALESCE(similarity(p."title", ${q}) * ${RANK_TIER.TRIGRAM_SCALE}, 0)
      ) AS rank
      FROM "problems" p
      LEFT JOIN "categories" c ON c."id" = p."categoryId"
      LEFT JOIN "topics" t ON t."id" = p."topicId"
      WHERE p."status" = 'PUBLISHED'
        AND (
          (${isUuid} AND p."id"::text = ${q})
          OR lower(p."title") = lower(${q})
          OR p."title" ILIKE ${prefix}
          OR ((SELECT numnode(tsq) FROM q) > 0 AND p."searchVector" @@ (SELECT tsq FROM q))
          OR similarity(p."title", ${q}) > ${TRIGRAM_THRESHOLD}
          OR p."title" ILIKE ${contains}
          OR t."name" ILIKE ${contains}
          OR c."name" ILIKE ${contains}
          OR EXISTS (
            SELECT 1 FROM "problem_exams" pe
            JOIN "exam_tags" e ON e."id" = pe."examTagId"
            WHERE pe."problemId" = p."id"
              AND (e."slug" ILIKE ${contains} OR e."name" ILIKE ${contains})
          )
        )
        ${query.topic ? Prisma.sql`AND t."slug" = ${query.topic}` : Prisma.empty}
        ${query.difficulty ? Prisma.sql`AND p."difficulty" = ${query.difficulty}::"Difficulty"` : Prisma.empty}
        ${query.ratingMin !== undefined ? Prisma.sql`AND p."rating" >= ${query.ratingMin}` : Prisma.empty}
        ${query.ratingMax !== undefined ? Prisma.sql`AND p."rating" <= ${query.ratingMax}` : Prisma.empty}
        ${
          query.exam
            ? Prisma.sql`AND EXISTS (
              SELECT 1 FROM "problem_exams" pe2
              JOIN "exam_tags" e2 ON e2."id" = pe2."examTagId"
              WHERE pe2."problemId" = p."id" AND e2."slug" = ${query.exam}
            )`
            : Prisma.empty
        }
        ${solvedJoin}
        ${favoritedJoin}
      ORDER BY ${orderBy}
      LIMIT ${query.limit + 1} OFFSET ${offset}`;

    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const summaries = await this.problems.summarizeProblems(
      userId,
      page.map((row) => row.id),
    );
    const items = page
      .map((row) => summaries.get(row.id))
      .filter((item): item is ProblemSummaryDto => item !== undefined);
    const nextOffset = offset + query.limit;
    return {
      items,
      nextCursor: hasNextPage
        ? encodeSearchCursor({ h: fingerprintQuery(print), o: nextOffset })
        : null,
      hasNextPage,
    };
  }

  /**
   * Encode the next offset cursor for uniformly paginated single-type
   * searches. Grouped previews pass a null print and never paginate, so a
   * cursor can never escape the query+filters it was minted for.
   */
  private nextOffsetCursor(
    print: string | null | undefined,
    offset: number,
    limit: number,
    hasNextPage: boolean,
  ): string | null {
    if (!print || !hasNextPage) {
      return null;
    }
    return encodeSearchCursor({ h: fingerprintQuery(print), o: offset + limit });
  }

  private solvedPredicate(userId: string, solved: boolean): Prisma.Sql {
    return solved
      ? Prisma.sql`EXISTS (
          SELECT 1 FROM "submissions" s
          WHERE s."problemId" = p."id" AND s."userId" = ${userId}::uuid AND s."isCorrect" IS TRUE
        )`
      : Prisma.sql`NOT EXISTS (
          SELECT 1 FROM "submissions" s
          WHERE s."problemId" = p."id" AND s."userId" = ${userId}::uuid AND s."isCorrect" IS TRUE
        )`;
  }

  private favoritedPredicate(userId: string, favorited: boolean): Prisma.Sql {
    return favorited
      ? Prisma.sql`EXISTS (
          SELECT 1 FROM "favorite_collection_items" fci
          JOIN "favorite_collections" fc ON fc."id" = fci."collectionId"
          WHERE fci."problemId" = p."id" AND fc."ownerId" = ${userId}::uuid
        )`
      : Prisma.sql`NOT EXISTS (
          SELECT 1 FROM "favorite_collection_items" fci
          JOIN "favorite_collections" fc ON fc."id" = fci."collectionId"
          WHERE fci."problemId" = p."id" AND fc."ownerId" = ${userId}::uuid
        )`;
  }

  // ─── Topics ───────────────────────────────────────────────────────────

  async searchTopics(
    q: string,
    limit: number,
    offset = 0,
    fingerprint?: string,
  ): Promise<{ items: TopicSearchResultDto[]; nextCursor: string | null; hasNextPage: boolean }> {
    const where = {
      isActive: true,
      OR: [
        { name: { contains: q, mode: 'insensitive' as const } },
        { slug: { contains: q, mode: 'insensitive' as const } },
      ],
    };
    const rows = await this.prisma.topic.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit + 1,
      include: {
        category: { select: { slug: true, name: true } },
        _count: { select: { problems: { where: { status: 'PUBLISHED' } } } },
      },
    });
    const hasNextPage = rows.length > limit;
    const page = hasNextPage ? rows.slice(0, limit) : rows;
    return {
      items: page.map((row) => ({
        kind: 'TOPIC' as const,
        id: row.id,
        name: row.name,
        slug: row.slug,
        domainSlug: row.category.slug,
        domainName: row.category.name,
        problemCount: row._count.problems,
      })),
      nextCursor: this.nextOffsetCursor(fingerprint, offset, limit, hasNextPage),
      hasNextPage,
    };
  }

  // ─── Learning ─────────────────────────────────────────────────────────

  async searchLearning(
    q: string,
    limit: number,
    offset = 0,
    fingerprint?: string | null,
  ): Promise<{
    items: LearningSearchResultDto[];
    nextCursor: string | null;
    hasNextPage: boolean;
  }> {
    const contains = { contains: q, mode: 'insensitive' as const };
    if (!fingerprint) {
      // Grouped preview: one mixed shelf across paths, topics and lessons.
      const [paths, topics, lessons] = await Promise.all([
        this.prisma.learningPath.findMany({
          where: { status: 'PUBLISHED', title: contains },
          take: Math.ceil(limit / 3),
          select: { id: true, slug: true, title: true },
        }),
        this.prisma.learningTopic.findMany({
          where: { status: 'PUBLISHED', title: contains },
          take: Math.ceil(limit / 3),
          select: {
            id: true,
            slug: true,
            title: true,
            path: { select: { slug: true, title: true } },
          },
        }),
        this.prisma.learningLesson.findMany({
          where: { status: 'PUBLISHED', title: contains },
          take: limit,
          select: {
            id: true,
            slug: true,
            title: true,
            topic: {
              select: { slug: true, title: true, path: { select: { slug: true, title: true } } },
            },
          },
        }),
      ]);
      const items: LearningSearchResultDto[] = [
        ...paths.map((row) => ({
          contentKind: 'path' as const,
          kind: 'LEARNING' as const,
          id: row.id,
          slug: row.slug,
          title: row.title,
          pathSlug: row.slug,
          pathTitle: row.title,
          topicSlug: null,
          topicTitle: null,
        })),
        ...topics.map((row) => ({
          contentKind: 'topic' as const,
          kind: 'LEARNING' as const,
          id: row.id,
          slug: row.slug,
          title: row.title,
          pathSlug: row.path.slug,
          pathTitle: row.path.title,
          topicSlug: row.slug,
          topicTitle: row.title,
        })),
        ...lessons.map((row) => ({
          contentKind: 'lesson' as const,
          kind: 'LEARNING' as const,
          id: row.id,
          slug: row.slug,
          title: row.title,
          pathSlug: row.topic.path.slug,
          pathTitle: row.topic.path.title,
          topicSlug: row.topic.slug,
          topicTitle: row.topic.title,
        })),
      ].slice(0, limit);
      return { items, nextCursor: null, hasNextPage: false };
    }
    // Single-type mode paginates lessons (the primary learning content)
    // with a deterministic order.
    const rows = await this.prisma.learningLesson.findMany({
      where: { status: 'PUBLISHED', title: contains },
      orderBy: [{ title: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: limit + 1,
      select: {
        id: true,
        slug: true,
        title: true,
        topic: {
          select: { slug: true, title: true, path: { select: { slug: true, title: true } } },
        },
      },
    });
    const hasNextPage = rows.length > limit;
    const page = hasNextPage ? rows.slice(0, limit) : rows;
    return {
      items: page.map((row) => ({
        contentKind: 'lesson' as const,
        kind: 'LEARNING' as const,
        id: row.id,
        slug: row.slug,
        title: row.title,
        pathSlug: row.topic.path.slug,
        pathTitle: row.topic.path.title,
        topicSlug: row.topic.slug,
        topicTitle: row.topic.title,
      })),
      nextCursor: this.nextOffsetCursor(fingerprint, offset, limit, hasNextPage),
      hasNextPage,
    };
  }

  // ─── Contests (search projection; never leaks drafts) ─────────────────

  async searchContests(
    q: string,
    userId: string | undefined,
    limit: number,
    offset: number,
    fingerprint?: string | null,
  ): Promise<{ items: ContestSummaryDto[]; nextCursor: string | null; hasNextPage: boolean }> {
    const rows = await this.prisma.contest.findMany({
      where: {
        status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'LIVE', 'ENDED'] },
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ startsAt: 'desc' }],
      skip: offset,
      take: limit + 1,
      include: {
        createdBy: { select: { displayName: true } },
        _count: { select: { participants: true } },
      },
    });
    const hasNextPage = rows.length > limit;
    const page = hasNextPage ? rows.slice(0, limit) : rows;
    const registered = await this.contestRegisteredSet(
      page.map((row) => row.id),
      userId,
    );
    const now = new Date();
    const tier = (title: string): number => {
      if (title.toLowerCase() === q.toLowerCase()) {
        return 0;
      }
      if (title.toLowerCase().startsWith(q.toLowerCase())) {
        return 1;
      }
      return 2;
    };
    const items = page
      .map((row) => ({
        id: row.id,
        name: row.title,
        description: row.description,
        status: row.status,
        phase: (row.status === 'LIVE' ? 'live' : row.status === 'ENDED' ? 'past' : 'upcoming') as
          'live' | 'upcoming' | 'past',
        difficulty: row.difficulty,
        durationSeconds: row.durationSeconds,
        durationMinutes: Math.round(row.durationSeconds / 60),
        questionCount: row.questionCount,
        participantCount: row._count.participants,
        maxParticipants: row.maxParticipants,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        registrationOpensAt: row.registrationOpensAt?.toISOString() ?? null,
        registrationClosesAt: row.registrationClosesAt?.toISOString() ?? null,
        registrationOpen:
          row.status === 'REGISTRATION_OPEN' &&
          (!row.registrationOpensAt || now >= row.registrationOpensAt) &&
          (!row.registrationClosesAt || now <= row.registrationClosesAt),
        isRegistered: registered.has(row.id),
        organizer: { id: row.createdById, displayName: row.createdBy?.displayName ?? 'ApteeZ' },
      }))
      .sort((a, b) => tier(a.name) - tier(b.name) || (a.startsAt < b.startsAt ? 1 : -1));
    return {
      items,
      nextCursor: this.nextOffsetCursor(fingerprint, offset, limit, hasNextPage),
      hasNextPage,
    };
  }

  private async contestRegisteredSet(ids: string[], userId?: string): Promise<Set<string>> {
    if (!userId || ids.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.contestParticipant.findMany({
      where: { contestId: { in: ids }, userId },
      select: { contestId: true },
    });
    return new Set(rows.map((row) => row.contestId));
  }

  // ─── Events (visibility-gated; private stays invite-only) ─────────────

  async searchEvents(
    q: string,
    userId: string | undefined,
    limit: number,
    offset: number,
    fingerprint?: string | null,
  ): Promise<{ items: EventSummaryDto[]; nextCursor: string | null; hasNextPage: boolean }> {
    const visibility = await this.visibleEventFilter(userId);
    const rows = await this.prisma.event.findMany({
      where: {
        status: {
          in: ['PUBLISHED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE', 'COMPLETED'],
        },
        // AND-combined: spreading would let the text-match OR clobber the
        // visibility OR. Visibility stays enforced on every branch.
        AND: [
          visibility,
          {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
          },
        ],
      },
      orderBy: [{ startAt: 'asc' }],
      skip: offset,
      take: limit + 1,
      include: {
        organizer: { select: { displayName: true } },
        organization: { select: { id: true, name: true } },
        _count: { select: { participants: true } },
      },
    });
    const hasNextPage = rows.length > limit;
    const page = hasNextPage ? rows.slice(0, limit) : rows;
    const registered = await this.eventRegisteredSet(
      page.map((row) => row.id),
      userId,
    );
    const now = new Date();
    const items: EventSummaryDto[] = page.map((row) => {
      const live = row.status === 'LIVE' && now >= row.startAt && now <= row.endAt;
      const past = row.status === 'COMPLETED' || now > row.endAt;
      return {
        id: row.id,
        title: row.title,
        slug: row.slug,
        description: row.description?.slice(0, 280) ?? null,
        eventType: row.eventType,
        visibility: row.visibility,
        status: row.status,
        phase: live ? 'live' : past ? 'past' : 'upcoming',
        difficulty: row.difficulty,
        durationMinutes: row.durationMinutes,
        questionCount: row.questionCount,
        participantCount: row._count.participants,
        maxParticipants: row.maxParticipants,
        spotsLeft:
          row.maxParticipants !== null
            ? Math.max(0, row.maxParticipants - row._count.participants)
            : null,
        registrationOpen:
          row.status === 'REGISTRATION_OPEN' &&
          (!row.registrationStartAt || now >= row.registrationStartAt) &&
          (!row.registrationEndAt || now <= row.registrationEndAt),
        isRegistered: registered.has(row.id),
        isOfficial: row.isOfficial,
        isPaid: row.isPaid,
        price: row.price,
        startsAt: row.startAt.toISOString(),
        endsAt: row.endAt.toISOString(),
        registrationStartAt: row.registrationStartAt?.toISOString() ?? null,
        registrationEndAt: row.registrationEndAt?.toISOString() ?? null,
        organizer: { id: row.organizerId, displayName: row.organizer?.displayName ?? 'ApteeZ' },
        organization: row.organization
          ? { id: row.organization.id, name: row.organization.name }
          : null,
      };
    });
    return {
      items,
      nextCursor: this.nextOffsetCursor(fingerprint, offset, limit, hasNextPage),
      hasNextPage,
    };
  }

  /** Anonymous callers see public events only; members additionally see their org events + invites. */
  private async visibleEventFilter(userId?: string): Promise<Prisma.EventWhereInput> {
    if (!userId) {
      return { visibility: 'PUBLIC' };
    }
    const [memberships, invites] = await Promise.all([
      this.prisma.organizationMember.findMany({
        where: { userId },
        select: { organizationId: true },
      }),
      this.prisma.eventInvite.findMany({
        where: { invitedUserId: userId, status: { in: ['PENDING', 'ACCEPTED'] } },
        select: { eventId: true },
      }),
    ]);
    const orgIds = memberships.map((row) => row.organizationId);
    const invitedIds = invites.map((row) => row.eventId);
    return {
      OR: [
        { visibility: 'PUBLIC' },
        ...(orgIds.length > 0 ? [{ organizationId: { in: orgIds } }] : []),
        ...(invitedIds.length > 0 ? [{ id: { in: invitedIds } }] : []),
      ],
    };
  }

  private async eventRegisteredSet(ids: string[], userId?: string): Promise<Set<string>> {
    if (!userId || ids.length === 0) {
      return new Set();
    }
    const rows = await this.prisma.eventParticipant.findMany({
      where: { eventId: { in: ids }, userId },
      select: { eventId: true },
    });
    return new Set(rows.map((row) => row.eventId));
  }

  // ─── Discussions (public, non-deleted) ────────────────────────────────

  async searchDiscussions(
    q: string,
    limit: number,
    offset: number,
    fingerprint?: string | null,
  ): Promise<{
    items: DiscussionThreadSummaryDto[];
    nextCursor: string | null;
    hasNextPage: boolean;
  }> {
    const rows = await this.prisma.discussionPost.findMany({
      where: {
        deletedAt: null,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { body: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ lastActivityAt: 'desc' }],
      skip: offset,
      take: limit + 1,
      include: {
        author: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarKey: true,
            institution: true,
          },
        },
      },
    });
    const hasNextPage = rows.length > limit;
    const page = hasNextPage ? rows.slice(0, limit) : rows;
    return {
      items: page.map((row) => ({
        id: row.id,
        title: row.title,
        excerpt: row.body.slice(0, 200),
        tags: row.tags,
        author: {
          id: row.author.id,
          username: row.author.username,
          displayName: row.author.displayName,
          avatarKey: row.author.avatarKey,
          institution: row.author.institution,
        },
        problemId: row.problemId,
        isPinned: row.isPinned,
        isLocked: row.isLocked,
        isResolved: row.isResolved,
        viewCount: row.viewCount,
        reactionCount: row.reactionCount,
        replyCount: row.replyCount,
        lastActivityAt: row.lastActivityAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        myReaction: null,
      })),
      nextCursor: this.nextOffsetCursor(fingerprint, offset, limit, hasNextPage),
      hasNextPage,
    };
  }

  // ─── Autocomplete (prefix-first, cached, cheap) ───────────────────────

  async suggestions(q: string): Promise<SearchSuggestionsDto> {
    const normalized = normalizeQuery(q);
    const key = redisKeys.searchSuggest(
      createHash('sha256').update(normalized).digest('hex').slice(0, 16),
    );
    const cached = await this.cacheGet<SearchSuggestionsDto>(key);
    if (cached) {
      return cached;
    }
    const [problems, topics, contests, events, discussions] = await Promise.all([
      this.prisma.problem.findMany({
        where: { status: 'PUBLISHED', title: { startsWith: q, mode: 'insensitive' } },
        orderBy: [{ title: 'asc' }],
        take: 5,
        select: { id: true, title: true },
      }),
      this.prisma.topic.findMany({
        where: { isActive: true, name: { startsWith: q, mode: 'insensitive' } },
        orderBy: [{ name: 'asc' }],
        take: 5,
        select: { slug: true, name: true },
      }),
      this.prisma.contest.findMany({
        where: {
          status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'LIVE'] },
          title: { startsWith: q, mode: 'insensitive' },
        },
        orderBy: [{ startsAt: 'asc' }],
        take: 3,
        select: { id: true, title: true },
      }),
      this.prisma.event.findMany({
        where: {
          visibility: 'PUBLIC',
          status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'LIVE'] },
          title: { startsWith: q, mode: 'insensitive' },
        },
        orderBy: [{ startAt: 'asc' }],
        take: 3,
        select: { id: true, title: true },
      }),
      this.prisma.discussionPost.findMany({
        where: { deletedAt: null, title: { startsWith: q, mode: 'insensitive' } },
        orderBy: [{ lastActivityAt: 'desc' }],
        take: 3,
        select: { id: true, title: true },
      }),
    ]);
    const payload: SearchSuggestionsDto = { problems, topics, contests, events, discussions };
    await this.cacheSet(key, payload, SUGGEST_TTL_SECONDS);
    return payload;
  }

  // ─── Filter metadata (cached aggregates) ──────────────────────────────

  async problemFilters(): Promise<ProblemFilterMetadataDto> {
    const cached = await this.cacheGet<ProblemFilterMetadataDto>(redisKeys.searchFilters());
    if (cached) {
      return cached;
    }
    const [topics, exams] = await Promise.all([
      this.prisma.topic.findMany({
        where: { isActive: true },
        orderBy: [{ name: 'asc' }],
        select: {
          slug: true,
          name: true,
          category: { select: { slug: true } },
          _count: { select: { problems: { where: { status: 'PUBLISHED' } } } },
        },
      }),
      this.prisma.examTag.findMany({
        where: { isActive: true },
        orderBy: [{ name: 'asc' }],
        select: {
          slug: true,
          name: true,
          _count: { select: { problems: { where: { problem: { status: 'PUBLISHED' } } } } },
        },
      }),
    ]);
    const payload: ProblemFilterMetadataDto = {
      topics: topics.map((row) => ({
        slug: row.slug,
        name: row.name,
        domainSlug: row.category.slug,
        problemCount: row._count.problems,
      })),
      difficulties: ['EASY', 'MEDIUM', 'HARD'],
      exams: exams.map((row) => ({
        slug: row.slug,
        name: row.name,
        problemCount: row._count.problems,
      })),
      rating: { min: 0, max: 4000 },
    };
    await this.cacheSet(redisKeys.searchFilters(), payload, FILTERS_TTL_SECONDS);
    return payload;
  }

  // ─── Trending (unique-user signals, cached) ───────────────────────────

  async trending(): Promise<TrendingContentDto> {
    const cached = await this.cacheGet<TrendingContentDto>(redisKeys.searchTrending());
    if (cached) {
      return cached;
    }
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const popular = await this.prisma.$queryRaw<Array<{ problemId: string }>>`
      SELECT "problemId" FROM "submissions"
      WHERE "status" = 'SUBMITTED' AND "submittedAt" >= ${weekAgo}
      GROUP BY "problemId"
      ORDER BY COUNT(DISTINCT "userId") DESC
      LIMIT 10`;
    const [summaries, contests, events, discussions] = await Promise.all([
      this.problems.summarizeProblems(
        undefined,
        popular.map((row) => row.problemId),
      ),
      this.prisma.contest.findMany({
        where: { status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'LIVE'] } },
        orderBy: [{ participants: { _count: 'desc' } }, { startsAt: 'asc' }],
        take: 5,
        include: {
          createdBy: { select: { displayName: true } },
          _count: { select: { participants: true } },
        },
      }),
      this.prisma.event.findMany({
        where: {
          visibility: 'PUBLIC',
          status: { in: ['PUBLISHED', 'REGISTRATION_OPEN', 'LIVE'] },
        },
        orderBy: [{ participantCount: 'desc' }, { startAt: 'asc' }],
        take: 5,
        include: {
          organizer: { select: { displayName: true } },
          organization: { select: { id: true, name: true } },
          _count: { select: { participants: true } },
        },
      }),
      this.prisma.discussionPost.findMany({
        where: { deletedAt: null, lastActivityAt: { gte: weekAgo } },
        orderBy: [{ reactionCount: 'desc' }, { lastActivityAt: 'desc' }],
        take: 5,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarKey: true,
              institution: true,
            },
          },
        },
      }),
    ]);
    const now = new Date();
    const payload: TrendingContentDto = {
      problems: popular
        .map((row) => summaries.get(row.problemId))
        .filter((item): item is ProblemSummaryDto => item !== undefined),
      contests: contests.map((row) => this.toContestCard(row, new Set(), now)),
      events: events.map((row) => this.toEventCard(row, new Set(), now)),
      discussions: discussions.map((row) => ({
        id: row.id,
        title: row.title,
        excerpt: row.body.slice(0, 200),
        tags: row.tags,
        author: {
          id: row.author.id,
          username: row.author.username,
          displayName: row.author.displayName,
          avatarKey: row.author.avatarKey,
          institution: row.author.institution,
        },
        problemId: row.problemId,
        isPinned: row.isPinned,
        isLocked: row.isLocked,
        isResolved: row.isResolved,
        viewCount: row.viewCount,
        reactionCount: row.reactionCount,
        replyCount: row.replyCount,
        lastActivityAt: row.lastActivityAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
        myReaction: null,
      })),
    };
    await this.cacheSet(redisKeys.searchTrending(), payload, TRENDING_TTL_SECONDS);
    return payload;
  }

  // Shared card builders so trending and typed search project identically.
  // (Kept private to SearchService: the owning modules remain the writers.)
  private toContestCard(
    row: {
      id: string;
      title: string;
      description: string | null;
      status: ContestSummaryDto['status'];
      difficulty: ContestSummaryDto['difficulty'];
      durationSeconds: number;
      questionCount: number;
      maxParticipants: number | null;
      startsAt: Date;
      endsAt: Date;
      registrationOpensAt: Date | null;
      registrationClosesAt: Date | null;
      createdById: string | null;
      createdBy: { displayName: string } | null;
      _count: { participants: number };
    },
    registered: Set<string>,
    now: Date,
  ): ContestSummaryDto {
    return {
      id: row.id,
      name: row.title,
      description: row.description,
      status: row.status,
      phase: (row.status === 'LIVE' ? 'live' : row.status === 'ENDED' ? 'past' : 'upcoming') as
        'live' | 'upcoming' | 'past',
      difficulty: row.difficulty,
      durationSeconds: row.durationSeconds,
      durationMinutes: Math.round(row.durationSeconds / 60),
      questionCount: row.questionCount,
      participantCount: row._count.participants,
      maxParticipants: row.maxParticipants,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      registrationOpensAt: row.registrationOpensAt?.toISOString() ?? null,
      registrationClosesAt: row.registrationClosesAt?.toISOString() ?? null,
      registrationOpen:
        row.status === 'REGISTRATION_OPEN' &&
        (!row.registrationOpensAt || now >= row.registrationOpensAt) &&
        (!row.registrationClosesAt || now <= row.registrationClosesAt),
      isRegistered: registered.has(row.id),
      organizer: { id: row.createdById, displayName: row.createdBy?.displayName ?? 'ApteeZ' },
    };
  }

  private toEventCard(
    row: {
      id: string;
      title: string;
      slug: string;
      description: string;
      eventType: EventSummaryDto['eventType'];
      visibility: EventSummaryDto['visibility'];
      status: EventSummaryDto['status'];
      difficulty: EventSummaryDto['difficulty'];
      durationMinutes: number;
      questionCount: number;
      maxParticipants: number | null;
      isOfficial: boolean;
      isPaid: boolean;
      price: number | null;
      startAt: Date;
      endAt: Date;
      registrationStartAt: Date | null;
      registrationEndAt: Date | null;
      organizerId: string | null;
      organizer: { displayName: string } | null;
      organization: { id: string; name: string } | null;
      _count: { participants: number };
    },
    registered: Set<string>,
    now: Date,
  ): EventSummaryDto {
    const live = row.status === 'LIVE' && now >= row.startAt && now <= row.endAt;
    const past = row.status === 'COMPLETED' || now > row.endAt;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description?.slice(0, 280) ?? null,
      eventType: row.eventType,
      visibility: row.visibility,
      status: row.status,
      phase: live ? 'live' : past ? 'past' : 'upcoming',
      difficulty: row.difficulty,
      durationMinutes: row.durationMinutes,
      questionCount: row.questionCount,
      participantCount: row._count.participants,
      maxParticipants: row.maxParticipants,
      spotsLeft:
        row.maxParticipants !== null
          ? Math.max(0, row.maxParticipants - row._count.participants)
          : null,
      registrationOpen:
        row.status === 'REGISTRATION_OPEN' &&
        (!row.registrationStartAt || now >= row.registrationStartAt) &&
        (!row.registrationEndAt || now <= row.registrationEndAt),
      isRegistered: registered.has(row.id),
      isOfficial: row.isOfficial,
      isPaid: row.isPaid,
      price: row.price,
      startsAt: row.startAt.toISOString(),
      endsAt: row.endAt.toISOString(),
      registrationStartAt: row.registrationStartAt?.toISOString() ?? null,
      registrationEndAt: row.registrationEndAt?.toISOString() ?? null,
      organizer: { id: row.organizerId, displayName: row.organizer?.displayName ?? 'ApteeZ' },
      organization: row.organization
        ? { id: row.organization.id, name: row.organization.name }
        : null,
    };
  }

  // ─── Analytics + recent searches (never blocks) ───────────────────────

  /** Persist a search/click event without delaying the response. */
  logEvent(input: SearchAnalyticsInput, userId?: string): void {
    void this.prisma.searchEvent
      .create({
        data: {
          userId: userId ?? null,
          sessionKey: input.sessionKey?.slice(0, 64) ?? null,
          event: input.event,
          query: input.query.slice(0, 120),
          resultType: input.resultType ?? null,
          resultId: input.resultId ?? null,
        },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `search.analytics-failed ${error instanceof Error ? error.message : String(error)}`,
          'Search',
        );
      });
  }

  async recentSearches(userId: string): Promise<RecentSearchDto[]> {
    const rows = await this.prisma.searchEvent.findMany({
      where: { userId, event: 'search' },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
      select: { query: true, resultType: true, createdAt: true },
    });
    const seen = new Set<string>();
    const items: RecentSearchDto[] = [];
    for (const row of rows) {
      const key = normalizeQuery(row.query);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      items.push({
        query: row.query,
        resultType: (row.resultType as RecentSearchDto['resultType']) ?? null,
        searchedAt: row.createdAt.toISOString(),
      });
      if (items.length >= 10) {
        break;
      }
    }
    return items;
  }

  async clearRecentSearches(userId: string): Promise<{ cleared: boolean }> {
    await this.prisma.searchEvent.deleteMany({ where: { userId } });
    return { cleared: true };
  }

  // ─── Cursor helpers ───────────────────────────────────────────────────

  private resolveCursor(query: SearchQuery, q: string): { offset: number; fingerprint: string } {
    const fingerprint = fingerprintInput(q, {
      type: query.type,
      topic: query.topic,
      difficulty: query.difficulty,
      ratingMin: query.ratingMin,
      ratingMax: query.ratingMax,
      exam: query.exam,
      solved: query.solved,
      favorited: query.favorited,
      sort: query.sort,
      limit: query.limit,
    });
    if (!query.cursor) {
      return { offset: 0, fingerprint };
    }
    const cursor = decodeSearchCursor(query.cursor);
    if (!cursor || cursor.h !== fingerprintQuery(fingerprint)) {
      throw new InvalidSearchCursorError();
    }
    return { offset: cursor.o, fingerprint };
  }

  private async cacheGet<T>(key: string): Promise<T | null> {
    try {
      if (!this.redis.isReady()) {
        return null;
      }
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private async cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      if (!this.redis.isReady()) {
        return;
      }
      await this.redis.set(key, JSON.stringify(value), ttlSeconds);
    } catch (error) {
      this.logger.warn(`search.cache-set-failed ${String(error)}`, 'Search');
    }
  }
}
