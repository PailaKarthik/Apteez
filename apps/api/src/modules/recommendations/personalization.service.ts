import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type {
  ContinueLearningDto,
  HomeRecommendationsDto,
  RecommendedContestDto,
  RecommendedEventDto,
  RecommendedProblemDto,
  RecommendedTopicDto,
} from '@apteez/types';
import { AppLogger } from '../../common/logger/app-logger';
import { RedisService } from '../../redis/redis.service';
import { redisKeys } from '../../redis/redis-keys';
import { ActivityService } from '../profile/activity.service';
import { PerformanceService } from '../profile/performance.service';
import { ProblemsService } from '../problems/problems.service';
import { ContestService } from '../contest/contest.service';
import { EventsService } from '../events/events.service';

const RECS_TTL_SECONDS = 300;
const LEVEL_BAND_LO = 200;
const LEVEL_BAND_HI = 300;
const LEVEL_BAND_WIDE_LO = 400;
const LEVEL_BAND_WIDE_HI = 500;
const DEFAULT_LEVEL = 1500;

/**
 * Deterministic, data-driven personalization. No LLM, no random picks: every
 * recommendation carries the reason it was chosen, computed from solved
 * history, weak areas, recent topics, favorites, learning progress and
 * competitive history via the canonical profile services. New users get
 * popularity-based discovery explicitly labeled cold-start. These methods
 * double as future LangGraph tool implementations alongside
 * CoachToolsService.
 */
@Injectable()
export class PersonalizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: PerformanceService,
    private readonly activity: ActivityService,
    private readonly problems: ProblemsService,
    private readonly contests: ContestService,
    private readonly events: EventsService,
    private readonly redis: RedisService,
    private readonly logger: AppLogger,
  ) {}

  // ─── Recommended problems ─────────────────────────────────────────────

  async recommendedProblems(
    userId: string | undefined,
    limit: number,
  ): Promise<RecommendedProblemDto[]> {
    if (!userId) {
      const ids = await this.popularProblemIds(limit);
      const summaries = await this.problems.summarizeProblems(undefined, ids);
      return ids
        .map((id, index): RecommendedProblemDto | null => {
          const problem = summaries.get(id);
          return problem
            ? {
                problem,
                reason: 'Popular with learners this week.',
                priority: index + 1,
                source: 'popular',
              }
            : null;
        })
        .filter((item): item is RecommendedProblemDto => item !== null);
    }
    const cacheKey = redisKeys.recommendations(userId, 'problems');
    const cached = await this.cacheGet<RecommendedProblemDto[]>(cacheKey);
    if (cached) {
      return cached.slice(0, limit);
    }
    const [weakAreas, recentTopics, favoriteTopics, solvedIds, attemptedIds, level] =
      await Promise.all([
        this.performance.weakAreas(userId).catch(() => []),
        this.recentTopicSlugs(userId, 3),
        this.favoriteTopicSlugs(userId, 3),
        this.distinctSolvedIds(userId),
        this.recentlyAttemptedIds(userId, 7),
        this.userLevel(userId),
      ]);

    const picks: Array<{
      problemId: string;
      reason: string;
      priority: number;
      source: RecommendedProblemDto['source'];
    }> = [];
    const taken = new Set<string>(solvedIds);
    let priority = 0;

    const takeFromTopics = async (
      slugs: string[],
      reasonFor: (topicName: string, extra: string) => string,
      source: RecommendedProblemDto['source'],
      perTopic: number,
    ): Promise<void> => {
      for (const slug of slugs) {
        if (picks.length >= limit) {
          break;
        }
        const topic = await this.prisma.topic.findFirst({
          where: { slug },
          orderBy: { id: 'asc' },
          select: { name: true },
        });
        const candidates = await this.candidateProblems(
          slug,
          level,
          taken,
          attemptedIds,
          perTopic * 2,
        );
        let added = 0;
        for (const id of candidates) {
          if (picks.length >= limit || added >= perTopic) {
            break;
          }
          taken.add(id);
          priority += 1;
          picks.push({
            problemId: id,
            reason: reasonFor(topic?.name ?? slug, slug),
            priority,
            source,
          });
          added += 1;
        }
      }
    };

    // 1. Weak areas with sufficient data (already threshold-gated upstream).
    const weakSlugs = weakAreas.slice(0, 3).map((area) => area.topicSlug);
    const weakBySlug = new Map(weakAreas.map((area) => [area.topicSlug, area]));
    await takeFromTopics(
      weakSlugs,
      (topicName, slug) => {
        const area = weakBySlug.get(slug);
        const accuracy = area?.accuracy;
        return `Your accuracy in ${topicName}${accuracy === null || accuracy === undefined ? '' : ` is ${accuracy}%`} — rebuild it here.`;
      },
      'weak-area',
      3,
    );
    // 2. Recently studied topics.
    await takeFromTopics(
      recentTopics.filter((slug) => !weakSlugs.includes(slug)),
      (topicName) => `Based on your recent work in ${topicName}.`,
      'recent-topic',
      2,
    );
    // 3. Favorite-collection topics.
    await takeFromTopics(
      favoriteTopics.filter((slug) => !weakSlugs.includes(slug) && !recentTopics.includes(slug)),
      (topicName) => `From your saved ${topicName} collection.`,
      'favorites',
      2,
    );
    // 4. Top-up: popular unsolved problems at a sensible level.
    if (picks.length < limit) {
      const ids = await this.popularProblemIds(limit * 2, taken, attemptedIds, level);
      for (const id of ids) {
        if (picks.length >= limit) {
          break;
        }
        taken.add(id);
        priority += 1;
        picks.push({
          problemId: id,
          reason: 'Popular unsolved problems at your level.',
          priority,
          source: 'popular',
        });
      }
    }

    const summaries = await this.problems.summarizeProblems(
      userId,
      picks.map((pick) => pick.problemId),
    );
    const items = picks
      .map((pick) => {
        const problem = summaries.get(pick.problemId);
        return problem
          ? { problem, reason: pick.reason, priority: pick.priority, source: pick.source }
          : null;
      })
      .filter((item): item is RecommendedProblemDto => item !== null)
      .sort((a, b) => a.priority - b.priority)
      .slice(0, limit);
    await this.cacheSet(cacheKey, items, RECS_TTL_SECONDS);
    return items;
  }

  /** Unsolved PUBLISHED problems in a topic inside the level band, level-first order. */
  private async candidateProblems(
    topicSlug: string,
    level: number,
    exclude: Set<string>,
    skipRecent: Set<string>,
    take: number,
  ): Promise<string[]> {
    // Topic slugs are unique per category, not globally: first match wins
    // deterministically for candidate lookup.
    const topic = await this.prisma.topic.findFirst({
      where: { slug: topicSlug },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (!topic) {
      return [];
    }
    const bands: Array<[number, number]> = [
      [level - LEVEL_BAND_LO, level + LEVEL_BAND_HI],
      [level - LEVEL_BAND_WIDE_LO, level + LEVEL_BAND_WIDE_HI],
    ];
    for (const [lo, hi] of bands) {
      const rows = await this.prisma.problem.findMany({
        where: {
          status: 'PUBLISHED',
          topicId: topic.id,
          rating: { gte: lo, lte: hi },
        },
        orderBy: [{ rating: 'asc' }],
        take: take * 3,
        select: { id: true, rating: true },
      });
      // Slightly above demonstrated ability first, then reinforcement below.
      const ordered = [...rows].sort((a, b) => {
        const aAbove = a.rating >= level ? 0 : 1;
        const bAbove = b.rating >= level ? 0 : 1;
        return aAbove - bAbove || a.rating - b.rating;
      });
      const fresh = ordered
        .map((row) => row.id)
        .filter((id) => !exclude.has(id) && !skipRecent.has(id));
      if (fresh.length > 0) {
        return fresh.slice(0, take);
      }
    }
    return [];
  }

  /** Raw popular problem ids (unique-solver ordered); callers hydrate + label. */
  private async popularProblemIds(
    limit: number,
    exclude: Set<string> = new Set(),
    skipRecent: Set<string> = new Set(),
    level = DEFAULT_LEVEL,
  ): Promise<string[]> {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000);
    const rows = await this.prisma.$queryRaw<Array<{ problemId: string }>>`
      SELECT s."problemId" AS "problemId"
      FROM "submissions" s
      JOIN "problems" p ON p."id" = s."problemId"
      WHERE s."status" = 'SUBMITTED'
        AND s."submittedAt" >= ${weekAgo}
        AND p."status" = 'PUBLISHED'
        AND p."difficulty" IN ('EASY', 'MEDIUM')
        AND p."rating" BETWEEN ${level - LEVEL_BAND_WIDE_LO} AND ${level + LEVEL_BAND_WIDE_HI}
      GROUP BY s."problemId"
      ORDER BY COUNT(DISTINCT s."userId") DESC
      LIMIT ${limit * 2}`;
    const ids = rows
      .map((row) => row.problemId)
      .filter((id) => !exclude.has(id) && !skipRecent.has(id));
    const finalIds = ids.slice(0, limit);
    if (finalIds.length < limit) {
      // Deterministic fallback: highest-accuracy accessible problems.
      const fallback = await this.prisma.problem.findMany({
        where: { status: 'PUBLISHED', difficulty: { in: ['EASY', 'MEDIUM'] } },
        orderBy: [{ rating: 'asc' }, { id: 'asc' }],
        take: limit * 2,
        select: { id: true },
      });
      for (const row of fallback) {
        if (finalIds.length >= limit) {
          break;
        }
        if (!exclude.has(row.id) && !skipRecent.has(row.id) && !finalIds.includes(row.id)) {
          finalIds.push(row.id);
        }
      }
    }
    return finalIds;
  }

  // ─── Recommended topics ───────────────────────────────────────────────

  async recommendedTopics(
    userId: string | undefined,
    limit: number,
  ): Promise<RecommendedTopicDto[]> {
    if (!userId) {
      const popular = await this.prisma.topic.findMany({
        where: { isActive: true },
        orderBy: [{ problems: { _count: 'desc' } }, { name: 'asc' }],
        take: limit,
        select: {
          slug: true,
          name: true,
          category: { select: { slug: true, name: true } },
        },
      });
      return popular.map((row, index) => ({
        topicSlug: row.slug,
        topicName: row.name,
        domainSlug: row.category.slug,
        domainName: row.category.name,
        reason: 'A popular starting point for new learners.',
        priority: index + 1,
        source: 'popular' as const,
      }));
    }
    const [weakAreas, recentSlugs] = await Promise.all([
      this.performance.weakAreas(userId).catch(() => []),
      this.recentTopicSlugs(userId, 5),
    ]);
    const items: RecommendedTopicDto[] = [];
    let priority = 0;
    for (const area of weakAreas.slice(0, 4)) {
      priority += 1;
      items.push({
        topicSlug: area.topicSlug,
        topicName: area.topicName,
        domainSlug: area.domainSlug,
        domainName: area.domainName,
        reason: area.reason,
        priority,
        source: 'weak-area',
      });
    }
    const known = new Set(items.map((item) => item.topicSlug));
    for (const slug of recentSlugs) {
      if (items.length >= limit || known.has(slug)) {
        continue;
      }
      const topic = await this.prisma.topic.findFirst({
        where: { slug },
        orderBy: { id: 'asc' },
        select: { slug: true, name: true, category: { select: { slug: true, name: true } } },
      });
      if (!topic) {
        continue;
      }
      priority += 1;
      items.push({
        topicSlug: topic.slug,
        topicName: topic.name,
        domainSlug: topic.category.slug,
        domainName: topic.category.name,
        reason: 'You practiced this recently — keep the momentum.',
        priority,
        source: 'recent',
      });
    }
    return items.slice(0, limit);
  }

  // ─── Continue learning ────────────────────────────────────────────────

  async continueLearning(
    userId: string | undefined,
    limit: number,
  ): Promise<ContinueLearningDto[]> {
    if (!userId) {
      const first = await this.prisma.learningLesson.findMany({
        where: { status: 'PUBLISHED' },
        orderBy: [
          { topic: { path: { slug: 'asc' } } },
          { topic: { slug: 'asc' } },
          { slug: 'asc' },
        ],
        take: limit,
        select: {
          id: true,
          slug: true,
          title: true,
          topic: {
            select: {
              slug: true,
              title: true,
              path: { select: { slug: true, title: true } },
            },
          },
        },
      });
      return first.map((row) => ({
        lessonId: row.id,
        lessonSlug: row.slug,
        lessonTitle: row.title,
        topicSlug: row.topic.slug,
        topicTitle: row.topic.title,
        pathSlug: row.topic.path.slug,
        pathTitle: row.topic.path.title,
        status: 'UNSTARTED' as const,
        reason: 'A good place to start learning.',
      }));
    }
    const [started, weakAreas] = await Promise.all([
      this.prisma.userLearningProgress.findMany({
        where: { userId, status: 'STARTED' },
        orderBy: [{ lastViewedAt: 'desc' }],
        take: limit,
        select: {
          lesson: {
            select: {
              id: true,
              slug: true,
              title: true,
              topic: {
                select: {
                  slug: true,
                  title: true,
                  path: { select: { slug: true, title: true } },
                },
              },
            },
          },
        },
      }),
      this.performance.weakAreas(userId).catch(() => []),
    ]);
    const items: ContinueLearningDto[] = started.map((row) => ({
      lessonId: row.lesson.id,
      lessonSlug: row.lesson.slug,
      lessonTitle: row.lesson.title,
      topicSlug: row.lesson.topic.slug,
      topicTitle: row.lesson.topic.title,
      pathSlug: row.lesson.topic.path.slug,
      pathTitle: row.lesson.topic.path.title,
      status: 'STARTED' as const,
      reason: 'Pick up where you left off.',
    }));
    if (items.length < limit) {
      const weakSlugs = weakAreas.slice(0, 3).map((area) => area.topicSlug);
      for (const slug of weakSlugs) {
        if (items.length >= limit) {
          break;
        }
        const lesson = await this.prisma.learningLesson.findFirst({
          where: {
            status: 'PUBLISHED',
            topic: { slug },
            progress: { none: { userId, status: 'COMPLETED' } },
          },
          orderBy: [{ slug: 'asc' }],
          select: {
            id: true,
            slug: true,
            title: true,
            topic: {
              select: {
                slug: true,
                title: true,
                path: { select: { slug: true, title: true } },
              },
            },
          },
        });
        if (lesson && !items.some((item) => item.lessonId === lesson.id)) {
          items.push({
            lessonId: lesson.id,
            lessonSlug: lesson.slug,
            lessonTitle: lesson.title,
            topicSlug: lesson.topic.slug,
            topicTitle: lesson.topic.title,
            pathSlug: lesson.topic.path.slug,
            pathTitle: lesson.topic.path.title,
            status: 'UNSTARTED',
            reason: 'Strengthens one of your weak areas.',
          });
        }
      }
    }
    return items.slice(0, limit);
  }

  // ─── Contest / event recommendations ──────────────────────────────────

  async recommendedContests(
    userId: string | undefined,
    limit: number,
  ): Promise<RecommendedContestDto[]> {
    const page = await this.contests.list({ phase: 'upcoming', page: 1, pageSize: 20 }, userId);
    const open = page.items.filter((contest) => !contest.isRegistered).slice(0, limit);
    let topDomains: string[] = [];
    if (userId) {
      const domains = await this.performance.byDomain(userId).catch(() => []);
      topDomains = [...domains]
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 2)
        .map((row) => row.domainName);
    }
    return open.map((contest) => ({
      contest,
      reason:
        topDomains.length > 0
          ? `Open for registration${topDomains.includes(contest.name) ? ' in a domain you practice' : ''}.`
          : 'Open for registration.',
    }));
  }

  async recommendedEvents(
    caller: { id: string; roles: string[]; permissions: string[] } | undefined,
    limit: number,
  ): Promise<RecommendedEventDto[]> {
    const page = await this.events.list({ phase: 'upcoming', page: 1, pageSize: 20 }, caller);
    const open = page.items.filter((event) => !event.isRegistered).slice(0, limit);
    return open.map((event) => ({
      event,
      reason: event.organization
        ? `From ${event.organization.name} — open for registration.`
        : 'Open for registration.',
    }));
  }

  // ─── Home bundle ──────────────────────────────────────────────────────

  async home(
    userId: string | undefined,
    caller: { id: string; roles: string[]; permissions: string[] } | undefined,
  ): Promise<HomeRecommendationsDto> {
    if (!userId) {
      const [problemIds, contests, events, learning] = await Promise.all([
        this.popularProblemIds(5),
        this.recommendedContests(undefined, 3),
        this.recommendedEvents(undefined, 3),
        this.continueLearning(undefined, 1),
      ]);
      const summaries = await this.problems.summarizeProblems(undefined, problemIds);
      return {
        focus: {
          topicSlug: null,
          topicName: null,
          domainSlug: null,
          domainName: null,
          reason: 'Sign in for recommendations tuned to your performance.',
          accuracy: null,
          attempts: 0,
          streak: { current: 0, longest: 0, lastActiveDate: null, activeToday: false },
          ratingTrend: 0,
        },
        continueLearning: learning,
        problems: problemIds
          .map((id, index): RecommendedProblemDto | null => {
            const problem = summaries.get(id);
            return problem
              ? {
                  problem,
                  reason: 'Popular with learners this week.',
                  priority: index + 1,
                  source: 'popular',
                }
              : null;
          })
          .filter((item): item is RecommendedProblemDto => item !== null),
        contests,
        events,
      };
    }
    const [focus, continueLearning, problems, contests, events] = await Promise.all([
      this.activity.nextFocus(userId),
      this.continueLearning(userId, 1),
      this.recommendedProblems(userId, 5),
      this.recommendedContests(userId, 3),
      this.recommendedEvents(caller, 3),
    ]);
    return { focus, continueLearning, problems, contests, events };
  }

  // ─── Signal helpers (read-only, indexed) ──────────────────────────────

  private async recentTopicSlugs(userId: string, take: number): Promise<string[]> {
    const rows = await this.prisma.submission.findMany({
      where: { userId, status: 'SUBMITTED' },
      orderBy: [{ submittedAt: 'desc' }],
      take: 50,
      select: { problem: { select: { topic: { select: { slug: true } } } } },
    });
    const slugs: string[] = [];
    for (const row of rows) {
      const slug = row.problem.topic?.slug;
      if (!slug || slugs.includes(slug)) {
        continue;
      }
      slugs.push(slug);
      if (slugs.length >= take) {
        break;
      }
    }
    return slugs;
  }

  private async favoriteTopicSlugs(userId: string, take: number): Promise<string[]> {
    const items = await this.prisma.favoriteCollectionItem.findMany({
      where: { collection: { ownerId: userId } },
      orderBy: [{ addedAt: 'desc' }],
      take: 50,
      select: { problem: { select: { topic: { select: { slug: true } } } } },
    });
    const counts = new Map<string, number>();
    for (const item of items) {
      const slug = item.problem.topic?.slug;
      if (!slug) {
        continue;
      }
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, take)
      .map(([slug]) => slug);
  }

  private async distinctSolvedIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.submission.findMany({
      where: { userId, status: 'SUBMITTED', isCorrect: true },
      select: { problemId: true },
      take: 5000,
    });
    return new Set(rows.map((row) => row.problemId));
  }

  private async recentlyAttemptedIds(userId: string, days: number): Promise<Set<string>> {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.submission.findMany({
      where: { userId, status: 'SUBMITTED', submittedAt: { gte: since } },
      select: { problemId: true },
      take: 2000,
    });
    return new Set(rows.map((row) => row.problemId));
  }

  /** Demonstrated level: mean rating of solved problems, defaulting to 1500. */
  private async userLevel(userId: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ avg: number | null }>>`
      SELECT AVG(p."rating")::float AS avg
      FROM "submissions" s
      JOIN "problems" p ON p."id" = s."problemId"
      WHERE s."userId" = ${userId}::uuid
        AND s."status" = 'SUBMITTED'
        AND s."isCorrect" IS TRUE`;
    const avg = rows[0]?.avg;
    return avg === null || avg === undefined || Number.isNaN(avg) ? DEFAULT_LEVEL : Math.round(avg);
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
      this.logger.warn(`recs.cache-set-failed ${String(error)}`, 'Recommendations');
    }
  }
}
