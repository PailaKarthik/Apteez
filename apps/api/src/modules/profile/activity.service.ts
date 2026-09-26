import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { ActivityDayDto, NextFocusDto, RecentActivityItemDto, StreakDto } from '@apteez/types';
import { AppLogger } from '../../common/logger/app-logger';
import { PerformanceService } from './performance.service';
import { computeStreak, dayKeyInTimezone } from './profile.utils';

interface DayCounters {
  problemsAttempted: number;
  problemsSolved: number;
  challengesPlayed: number;
  challengeWins: number;
  contestsAttempted: number;
  eventsJoined: number;
  lessonsCompleted: number;
  pointsEarned: number;
}

const emptyCounters = (): DayCounters => ({
  problemsAttempted: 0,
  problemsSolved: 0,
  challengesPlayed: 0,
  challengeWins: 0,
  contestsAttempted: 0,
  eventsJoined: 0,
  lessonsCompleted: 0,
  pointsEarned: 0,
});

const totalOf = (counters: DayCounters): number =>
  counters.problemsAttempted +
  counters.problemsSolved +
  counters.challengesPlayed +
  counters.contestsAttempted +
  counters.eventsJoined +
  counters.lessonsCompleted;

/**
 * Derives persisted daily rollups from AUTHORITATIVE records and serves
 * heatmaps, streaks and activity feeds. Recomputation is idempotent
 * (upsert per day) and lazy: readers trigger a catch-up of uncovered days,
 * so no existing submission/challenge/contest/event flow had to change and
 * concurrent readers converge on the same rows.
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: PerformanceService,
    private readonly logger: AppLogger,
  ) {}

  /** Rebuild any daily rows missing since the last catch-up. */
  async ensureFresh(userId: string): Promise<void> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      });
      const timezone = user?.timezone ?? 'UTC';
      // Watermark MUST ignore zero-activity rows: a points-only day (login /
      // onboarding bonus, no solves) writes totalActivityCount = 0, and using
      // it as the watermark seals that day off — later submissions are never
      // bucketed, so streaks and heatmaps freeze at 0 forever. Only a day
      // with real activity advances the watermark; zero rows are overwritten
      // by the recount below.
      const latest = await this.prisma.userActivityDaily.findFirst({
        where: { userId, totalActivityCount: { gt: 0 } },
        orderBy: { date: 'desc' },
        select: { date: true },
      });
      const todayKey = dayKeyInTimezone(new Date(), timezone);
      const fromDate = latest
        ? new Date(latest.date.getTime() + 86_400_000)
        : new Date(Date.now() - 366 * 86_400_000);
      const fromKey = fromDate.toISOString().slice(0, 10);
      if (fromKey > todayKey) {
        return;
      }
      const [submissions, challenges, contests, events, lessons, points] = await Promise.all([
        this.prisma.submission.findMany({
          where: { userId, status: 'SUBMITTED', submittedAt: { gte: fromDate } },
          select: { submittedAt: true, isCorrect: true },
        }),
        this.prisma.challengeRatingHistory.findMany({
          where: { userId, createdAt: { gte: fromDate } },
          select: { createdAt: true, result: true },
        }),
        this.prisma.contestResult.findMany({
          where: { userId, finalizedAt: { gte: fromDate } },
          select: { finalizedAt: true },
        }),
        this.prisma.eventResult.findMany({
          where: { userId, finalizedAt: { gte: fromDate } },
          select: { finalizedAt: true },
        }),
        this.prisma.userLearningProgress.findMany({
          where: { userId, completedAt: { gte: fromDate } },
          select: { completedAt: true },
        }),
        this.prisma.pointTransaction.findMany({
          where: { userId, type: 'EARN', createdAt: { gte: fromDate } },
          select: { createdAt: true, amount: true },
        }),
      ]);
      const byDay = new Map<string, DayCounters>();
      const bucket = (at: Date | null, apply: (counters: DayCounters) => void): void => {
        if (!at) {
          return;
        }
        const key = dayKeyInTimezone(at, timezone);
        if (key < fromKey || key > todayKey) {
          return;
        }
        const counters = byDay.get(key) ?? emptyCounters();
        apply(counters);
        byDay.set(key, counters);
      };
      for (const row of submissions) {
        bucket(row.submittedAt, (counters) => {
          counters.problemsAttempted += 1;
          if (row.isCorrect === true) {
            counters.problemsSolved += 1;
          }
        });
      }
      for (const row of challenges) {
        bucket(row.createdAt, (counters) => {
          counters.challengesPlayed += 1;
          if (row.result === 'WIN') {
            counters.challengeWins += 1;
          }
        });
      }
      for (const row of contests) {
        bucket(row.finalizedAt, (counters) => {
          counters.contestsAttempted += 1;
        });
      }
      for (const row of events) {
        bucket(row.finalizedAt, (counters) => {
          counters.eventsJoined += 1;
        });
      }
      for (const row of lessons) {
        bucket(row.completedAt, (counters) => {
          counters.lessonsCompleted += 1;
        });
      }
      for (const row of points) {
        bucket(row.createdAt, (counters) => {
          counters.pointsEarned += row.amount;
        });
      }
      if (byDay.size === 0) {
        return;
      }
      await this.prisma.$transaction(
        [...byDay.entries()].map(([key, counters]) =>
          this.prisma.userActivityDaily.upsert({
            where: { userId_date: { userId, date: new Date(`${key}T00:00:00.000Z`) } },
            update: { ...counters, totalActivityCount: totalOf(counters) },
            create: {
              userId,
              date: new Date(`${key}T00:00:00.000Z`),
              ...counters,
              totalActivityCount: totalOf(counters),
            },
          }),
        ),
      );
    } catch (error) {
      // Rollup failure must never break profile reads; next read retries.
      this.logger.warn(
        `profile.rollup-failed user=${userId} ${error instanceof Error ? error.message : String(error)}`,
        'Profile',
      );
    }
  }

  /** Last `days` calendar days, zero-filled, oldest first. Real persisted counts. */
  async heatmap(userId: string, days: number): Promise<ActivityDayDto[]> {
    await this.ensureFresh(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const timezone = user?.timezone ?? 'UTC';
    const todayKey = dayKeyInTimezone(new Date(), timezone);
    const keys: string[] = [];
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const cursor = new Date(`${todayKey}T00:00:00.000Z`);
      cursor.setUTCDate(cursor.getUTCDate() - offset);
      keys.push(cursor.toISOString().slice(0, 10));
    }
    const rows = await this.prisma.userActivityDaily.findMany({
      where: { userId, date: { gte: new Date(`${keys[0]}T00:00:00.000Z`) } },
      select: {
        date: true,
        totalActivityCount: true,
        problemsSolved: true,
        problemsAttempted: true,
      },
    });
    const byKey = new Map(
      rows.map((row) => [
        row.date.toISOString().slice(0, 10),
        {
          count: row.totalActivityCount,
          solved: row.problemsSolved,
          attempted: row.problemsAttempted,
        },
      ]),
    );
    return keys.map((key) => ({
      date: key,
      count: byKey.get(key)?.count ?? 0,
      solved: byKey.get(key)?.solved ?? 0,
      attempted: byKey.get(key)?.attempted ?? 0,
    }));
  }

  /** Fully recomputed streak, persisted idempotently. */
  async streak(userId: string): Promise<StreakDto> {
    await this.ensureFresh(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    const timezone = user?.timezone ?? 'UTC';
    const todayKey = dayKeyInTimezone(new Date(), timezone);
    const rows = await this.prisma.userActivityDaily.findMany({
      where: { userId, totalActivityCount: { gt: 0 } },
      select: { date: true },
      orderBy: { date: 'asc' },
    });
    const computed = computeStreak(
      rows.map((row) => row.date.toISOString().slice(0, 10)),
      todayKey,
    );
    await this.prisma.userStreak.upsert({
      where: { userId },
      update: {
        currentCount: computed.current,
        longestCount: computed.longest,
        lastActiveDate: computed.lastActiveDate
          ? new Date(`${computed.lastActiveDate}T00:00:00.000Z`)
          : null,
      },
      create: {
        userId,
        currentCount: computed.current,
        longestCount: computed.longest,
        lastActiveDate: computed.lastActiveDate
          ? new Date(`${computed.lastActiveDate}T00:00:00.000Z`)
          : null,
      },
    });
    return {
      current: computed.current,
      longest: computed.longest,
      lastActiveDate: computed.lastActiveDate,
      activeToday: computed.activeToday,
    };
  }

  /** Merged feed across canonical tables. Bounded per-source limits, merged in memory. */
  async recentActivity(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: RecentActivityItemDto[]; page: number; pageSize: number; hasMore: boolean }> {
    const perSource = Math.min(page * pageSize, 100);
    const [submissions, challenges, contests, events, achievements, contributions, lessons] =
      await Promise.all([
        this.prisma.submission.findMany({
          where: { userId, status: 'SUBMITTED' },
          orderBy: [{ submittedAt: 'desc' }],
          take: perSource,
          select: {
            id: true,
            isCorrect: true,
            submittedAt: true,
            problem: {
              select: {
                title: true,
                difficulty: true,
                category: { select: { name: true } },
              },
            },
          },
        }),
        this.prisma.challengeRatingHistory.findMany({
          where: { userId },
          orderBy: [{ createdAt: 'desc' }],
          take: perSource,
          select: {
            id: true,
            result: true,
            ratingChange: true,
            createdAt: true,
            category: { select: { name: true } },
            opponent: { select: { displayName: true } },
          },
        }),
        this.prisma.contestResult.findMany({
          where: { userId },
          orderBy: [{ finalizedAt: 'desc' }],
          take: perSource,
          select: {
            id: true,
            rank: true,
            score: true,
            finalizedAt: true,
            contest: { select: { title: true } },
          },
        }),
        this.prisma.eventResult.findMany({
          where: { userId },
          orderBy: [{ finalizedAt: 'desc' }],
          take: perSource,
          select: {
            id: true,
            rank: true,
            score: true,
            finalizedAt: true,
            event: { select: { title: true } },
          },
        }),
        this.prisma.userAchievement.findMany({
          where: { userId },
          orderBy: [{ unlockedAt: 'desc' }],
          take: perSource,
          select: {
            id: true,
            unlockedAt: true,
            achievement: { select: { name: true, points: true } },
          },
        }),
        this.prisma.contribution.findMany({
          where: { contributorId: userId },
          orderBy: [{ submittedAt: 'desc' }],
          take: perSource,
          select: { id: true, title: true, status: true, submittedAt: true },
        }),
        this.prisma.userLearningProgress.findMany({
          where: { userId, status: 'COMPLETED' },
          orderBy: [{ completedAt: 'desc' }],
          take: perSource,
          select: {
            id: true,
            completedAt: true,
            lesson: { select: { title: true } },
          },
        }),
      ]);
    const items: RecentActivityItemDto[] = [
      ...submissions.map((row) => ({
        id: `sub:${row.id}`,
        kind: 'solve' as const,
        title: row.problem.title,
        detail: `${row.problem.category.name} · ${row.problem.difficulty} · ${row.isCorrect ? 'Solved' : 'Attempted'}`,
        occurredAt: (row.submittedAt ?? new Date(0)).toISOString(),
      })),
      ...challenges.map((row) => ({
        id: `ch:${row.id}`,
        kind: 'challenge' as const,
        title: `Challenge vs ${row.opponent?.displayName ?? row.category.name}`,
        detail: `${row.result} · ${row.ratingChange >= 0 ? '+' : ''}${row.ratingChange} rating`,
        occurredAt: row.createdAt.toISOString(),
      })),
      ...contests.map((row) => ({
        id: `co:${row.id}`,
        kind: 'contest' as const,
        title: row.contest.title,
        detail: row.rank !== null ? `Rank #${row.rank} · ${row.score} pts` : `${row.score} pts`,
        occurredAt: row.finalizedAt.toISOString(),
      })),
      ...events.map((row) => ({
        id: `ev:${row.id}`,
        kind: 'event' as const,
        title: row.event.title,
        detail: row.rank !== null ? `Rank #${row.rank} · ${row.score} pts` : `${row.score} pts`,
        occurredAt: row.finalizedAt.toISOString(),
      })),
      ...achievements.map((row) => ({
        id: `ac:${row.id}`,
        kind: 'achievement' as const,
        title: `Unlocked ${row.achievement.name}`,
        detail: `+${row.achievement.points} pts`,
        occurredAt: row.unlockedAt.toISOString(),
      })),
      ...contributions.map((row) => ({
        id: `ct:${row.id}`,
        kind: 'contribution' as const,
        title: `Contributed ${row.title}`,
        detail: row.status,
        occurredAt: row.submittedAt.toISOString(),
      })),
      ...lessons.map((row) => ({
        id: `le:${row.id}`,
        kind: 'lesson' as const,
        title: `Completed ${row.lesson.title}`,
        detail: 'Lesson',
        occurredAt: (row.completedAt ?? new Date(0)).toISOString(),
      })),
    ].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      page,
      pageSize,
      hasMore: items.length > start + pageSize,
    };
  }

  async contributions(userId: string): Promise<{
    counts: Record<string, number>;
    recent: Array<{ id: string; title: string; status: string; submittedAt: string }>;
  }> {
    const [groups, recent] = await Promise.all([
      this.prisma.contribution.groupBy({
        by: ['status'],
        where: { contributorId: userId },
        _count: { status: true },
      }),
      this.prisma.contribution.findMany({
        where: { contributorId: userId },
        orderBy: [{ submittedAt: 'desc' }],
        take: 10,
        select: { id: true, title: true, status: true, submittedAt: true },
      }),
    ]);
    const counts: Record<string, number> = {};
    for (const group of groups) {
      counts[group.status] = group._count.status;
    }
    return {
      counts,
      recent: recent.map((row) => ({
        id: row.id,
        title: row.title,
        status: row.status,
        submittedAt: row.submittedAt.toISOString(),
      })),
    };
  }

  async profileEvents(userId: string): Promise<{
    events: Array<{
      id: string;
      title: string;
      status: string;
      rank: number | null;
      score: number;
    }>;
    contests: Array<{
      id: string;
      title: string;
      status: string;
      rank: number | null;
      score: number;
    }>;
    challenges: Array<{
      id: string;
      domain: string;
      result: string;
      change: number;
      createdAt: string;
    }>;
  }> {
    const [events, contests, challenges] = await Promise.all([
      this.prisma.eventResult.findMany({
        where: { userId },
        orderBy: [{ finalizedAt: 'desc' }],
        take: 10,
        select: {
          rank: true,
          score: true,
          event: { select: { id: true, title: true, status: true } },
        },
      }),
      this.prisma.contestResult.findMany({
        where: { userId },
        orderBy: [{ finalizedAt: 'desc' }],
        take: 10,
        select: {
          rank: true,
          score: true,
          contest: { select: { id: true, title: true, status: true } },
        },
      }),
      this.prisma.challengeRatingHistory.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }],
        take: 10,
        select: {
          id: true,
          result: true,
          ratingChange: true,
          createdAt: true,
          category: { select: { name: true } },
        },
      }),
    ]);
    return {
      events: events.map((row) => ({
        id: row.event.id,
        title: row.event.title,
        status: row.event.status,
        rank: row.rank,
        score: row.score,
      })),
      contests: contests.map((row) => ({
        id: row.contest.id,
        title: row.contest.title,
        status: row.contest.status,
        rank: row.rank,
        score: row.score,
      })),
      challenges: challenges.map((row) => ({
        id: row.id,
        domain: row.category.name,
        result: row.result,
        change: row.ratingChange,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** Deterministic next focus from real performance data. No LLM involved. */
  async nextFocus(userId: string): Promise<NextFocusDto> {
    const [weakAreas, domains, streak] = await Promise.all([
      this.performance.weakAreas(userId),
      this.performance.byDomain(userId),
      this.streak(userId),
    ]);
    const [recentChallenge, recentContest] = await Promise.all([
      this.prisma.challengeRatingHistory.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }],
        take: 5,
        select: { ratingChange: true },
      }),
      this.prisma.contestRatingHistory.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }],
        take: 1,
        select: { ratingChange: true },
      }),
    ]);
    const ratingTrend =
      recentChallenge.reduce((sum, row) => sum + row.ratingChange, 0) +
      recentContest.reduce((sum, row) => sum + row.ratingChange, 0);
    const weak = weakAreas[0];
    if (weak) {
      return {
        topicSlug: weak.topicSlug,
        topicName: weak.topicName,
        domainSlug: weak.domainSlug,
        domainName: weak.domainName,
        reason: weak.reason,
        accuracy: weak.accuracy,
        attempts: weak.attempts,
        streak,
        ratingTrend,
      };
    }
    const fallback =
      [...domains].sort((a, b) => (a.accuracy ?? 100) - (b.accuracy ?? 100))[0] ?? null;
    if (fallback && fallback.attempts > 0) {
      return {
        topicSlug: null,
        topicName: null,
        domainSlug: fallback.domainSlug,
        domainName: fallback.domainName,
        reason: `Lowest accuracy among your practiced domains at ${fallback.accuracy ?? '—'}%.`,
        accuracy: fallback.accuracy,
        attempts: fallback.attempts,
        streak,
        ratingTrend,
      };
    }
    return {
      topicSlug: null,
      topicName: null,
      domainSlug: null,
      domainName: null,
      reason: 'Solve a few problems to unlock personalized focus.',
      accuracy: null,
      attempts: 0,
      streak,
      ratingTrend,
    };
  }
}
