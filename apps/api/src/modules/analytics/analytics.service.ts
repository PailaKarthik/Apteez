import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import { AppLogger } from '../../common/logger/app-logger';
import { ANALYTICS_EVENTS, ANALYTICS_FUNNEL, sanitizeMetadata } from './analytics-events';

export interface RecordEventInput {
  userId?: string | null;
  metadata?: Record<string, unknown> | null;
  requestId?: string | null;
}

export interface OverviewPoint {
  date: string;
  activeUsers: number;
  events: number;
}

export interface OverviewResult {
  days: number;
  daily: OverviewPoint[];
  weeklyActiveUsers: number;
  monthlyActiveUsers: number;
  newUsers: number;
  totals: Array<{ name: string; count: number }>;
  ai: Array<{ feature: string; calls: number; failures: number; avgLatencyMs: number | null }>;
}

export interface FunnelStage {
  stage: string;
  users: number;
  conversionFromPrevious: number | null;
}

export interface RetentionCell {
  cohort: string;
  size: number;
  day1: number | null;
  day7: number | null;
  day30: number | null;
}

/**
 * Product analytics recorder + aggregator. Recording is fire-and-forget
 * (callers `void` it): analytics must never fail or slow a request.
 * Aggregations run plain PostgreSQL over indexed columns — sufficient for
 * initial scale, no warehouse. Rows are never seeded; demo journeys create
 * real rows through the API.
 */
@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  /** Validated, bounded, non-throwing recorder. Unknown names are dropped. */
  async record(name: string, input: RecordEventInput = {}): Promise<void> {
    if (!(ANALYTICS_EVENTS as readonly string[]).includes(name)) {
      this.logger.warn(`analytics.unknown-event name=${name.slice(0, 80)}`, 'Analytics');
      return;
    }
    try {
      await this.prisma.analyticsEvent.create({
        data: {
          name,
          userId: input.userId ?? null,
          metadata: (sanitizeMetadata(input.metadata) ?? undefined) as object | undefined,
          requestId: input.requestId?.slice(0, 64) ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `analytics.record-failed name=${name} ${error instanceof Error ? error.message : String(error)}`,
        'Analytics',
      );
    }
  }

  async overview(days = 30): Promise<OverviewResult> {
    const bounded = Math.min(Math.max(days, 1), 90);
    const since = new Date(Date.now() - bounded * 86_400_000);
    const [daily, totals, newUsers, ai] = await Promise.all([
      this.prisma.$queryRaw<Array<{ date: string; activeUsers: bigint; events: bigint }>>`
        SELECT TO_CHAR("createdAt", 'YYYY-MM-DD') AS date,
          COUNT(DISTINCT "userId") FILTER (WHERE "userId" IS NOT NULL)::int AS "activeUsers",
          COUNT(*)::int AS events
        FROM "analytics_events"
        WHERE "createdAt" >= ${since}
        GROUP BY 1 ORDER BY 1`,
      this.prisma.analyticsEvent.groupBy({
        by: ['name'],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { name: 'desc' } },
      }),
      this.prisma.user.count({ where: { createdAt: { gte: since } } }),
      this.aiSummary(bounded),
    ]);
    const [wau, mau] = await Promise.all([
      this.distinctUsersSince(new Date(Date.now() - 7 * 86_400_000)),
      this.distinctUsersSince(new Date(Date.now() - 30 * 86_400_000)),
    ]);
    return {
      days: bounded,
      daily: daily.map((row) => ({
        date: row.date,
        activeUsers: Number(row.activeUsers),
        events: Number(row.events),
      })),
      weeklyActiveUsers: wau,
      monthlyActiveUsers: mau,
      newUsers,
      totals: totals.map((row) => ({ name: row.name, count: row._count._all })),
      ai,
    };
  }

  /** Ordered funnel: users reaching each lifecycle stage (first occurrence). */
  async funnel(days = 30): Promise<{ stages: FunnelStage[]; cohortUsers: number }> {
    const bounded = Math.min(Math.max(days, 1), 90);
    const since = new Date(Date.now() - bounded * 86_400_000);
    const cohort = await this.prisma.user.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true },
    });
    const cohortIds = cohort.map((row) => row.id);
    const stages: FunnelStage[] = [];
    let previous: number | null = null;
    for (const stage of ANALYTICS_FUNNEL) {
      let users = 0;
      if (stage === 'auth.registered') {
        users = cohortIds.length;
      } else if (cohortIds.length > 0) {
        const rows = await this.prisma.analyticsEvent.groupBy({
          by: ['userId'],
          where: { userId: { in: cohortIds }, name: stage },
          _count: { _all: true },
        });
        users = rows.length;
      }
      stages.push({
        stage,
        users,
        conversionFromPrevious:
          previous === null || previous === 0 ? null : Math.round((users / previous) * 1000) / 10,
      });
      previous = users;
    }
    return { stages, cohortUsers: cohortIds.length };
  }

  /** D1/D7/D30 retention by signup cohort (mature cells only, else null). */
  async retention(cohortDays = 14): Promise<{ cells: RetentionCell[] }> {
    const bounded = Math.min(Math.max(cohortDays, 1), 60);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const cohorts = await this.prisma.$queryRaw<Array<{ date: string; size: bigint }>>`
      SELECT TO_CHAR("createdAt", 'YYYY-MM-DD') AS date, COUNT(*)::int AS size
      FROM "users"
      WHERE "createdAt" >= ${new Date(today.getTime() - bounded * 86_400_000)}
      GROUP BY 1 ORDER BY 1`;
    const cells: RetentionCell[] = [];
    for (const cohort of cohorts) {
      const base = new Date(`${cohort.date}T00:00:00.000Z`);
      const cell: RetentionCell = {
        cohort: cohort.date,
        size: Number(cohort.size),
        day1: null,
        day7: null,
        day30: null,
      };
      for (const [key, offset] of [
        ['day1', 1],
        ['day7', 7],
        ['day30', 30],
      ] as const) {
        const target = new Date(base.getTime() + offset * 86_400_000);
        if (target > today || cell.size === 0) {
          continue;
        }
        const start = target.toISOString().slice(0, 10);
        const rows = await this.prisma.$queryRaw<Array<{ users: bigint }>>`
          SELECT COUNT(DISTINCT e."userId")::int AS users
          FROM "analytics_events" e
          JOIN "users" u ON u."id" = e."userId"
          WHERE TO_CHAR(u."createdAt", 'YYYY-MM-DD') = ${cohort.date}
            AND TO_CHAR(e."createdAt", 'YYYY-MM-DD') = ${start}`;
        const active = Number(rows[0]?.users ?? 0);
        cell[key] = Math.round((active / cell.size) * 1000) / 10;
      }
      cells.push(cell);
    }
    return { cells };
  }

  private async aiSummary(days: number): Promise<OverviewResult['ai']> {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.aiUsageLog.groupBy({
      by: ['feature'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { latencyMs: true },
    });
    const failures = await this.prisma.aiUsageLog.groupBy({
      by: ['feature'],
      where: { createdAt: { gte: since }, success: false },
      _count: { _all: true },
    });
    const failedByFeature = new Map(failures.map((row) => [row.feature, row._count._all]));
    return rows.map((row) => ({
      feature: row.feature,
      calls: row._count._all,
      failures: failedByFeature.get(row.feature) ?? 0,
      avgLatencyMs: row._avg.latencyMs === null ? null : Math.round(row._avg.latencyMs),
    }));
  }

  private async distinctUsersSince(since: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ users: bigint }>>`
      SELECT COUNT(DISTINCT "userId")::int AS users
      FROM "analytics_events"
      WHERE "createdAt" >= ${since} AND "userId" IS NOT NULL`;
    return Number(rows[0]?.users ?? 0);
  }
}
