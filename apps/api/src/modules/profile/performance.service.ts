import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type {
  DifficultyPerformanceDto,
  DomainPerformanceDto,
  PerformanceOverallDto,
  TopicPerformanceDto,
  WeakAreaDto,
} from '@apteez/types';
import { accuracyOf, averageOf, scoreWeakArea } from './profile.utils';

interface DomainRow {
  slug: string;
  name: string;
  attempts: bigint | number;
  solved: bigint | number;
  avgtime: number | null;
  recentattempts: bigint | number;
  recentsolved: bigint | number;
}

interface TopicRow extends DomainRow {
  domainSlug: string;
  domainName: string;
}

interface DifficultyRow {
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  attempts: bigint | number;
  solved: bigint | number;
  avgtime: number | null;
  recentattempts: bigint | number;
  recentsolved: bigint | number;
}

/**
 * Read-only analytics over AUTHORITATIVE records (submissions + ratings).
 * Aggregations run in SQL with GROUP BY — submissions are never loaded into
 * application memory. These methods are also the future LangGraph tool
 * implementations (see CoachToolsService): the agent will call them, never SQL.
 */
@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  async overall(userId: string): Promise<PerformanceOverallDto> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        attempts: bigint | number;
        solved: bigint | number;
        distinctsolved: bigint | number;
        avgtime: number | null;
      }>
    >`
      SELECT COUNT(*)::int AS attempts,
             COUNT(*) FILTER (WHERE s."isCorrect" IS TRUE)::int AS solved,
             COUNT(DISTINCT s."problemId") FILTER (WHERE s."isCorrect" IS TRUE)::int AS distinctsolved,
             AVG(s."timeSpentSeconds")::float AS avgtime
        FROM "submissions" s
       WHERE s."userId" = ${userId}::uuid
         AND s."status"::text = 'SUBMITTED'`;
    const row = rows[0] ?? { attempts: 0, solved: 0, distinctsolved: 0, avgtime: null };
    const attempts = Number(row.attempts);
    const solved = Number(row.solved);
    const [challengeRatings, contestRating, totalProblems] = await Promise.all([
      this.prisma.challengeRating.findMany({ where: { userId }, select: { rating: true } }),
      this.prisma.contestRating.findUnique({ where: { userId }, select: { rating: true } }),
      this.prisma.problem.count({ where: { status: 'PUBLISHED' } }),
    ]);
    return {
      totalAttempted: attempts,
      totalSolved: solved,
      distinctSolved: Number(row.distinctsolved),
      totalProblems,
      accuracy: accuracyOf(solved, attempts),
      avgTimeSeconds: row.avgtime === null ? null : Math.round(row.avgtime),
      currentChallengeRating:
        challengeRatings.length === 0 ? null : Math.max(...challengeRatings.map((r) => r.rating)),
      currentContestRating: contestRating?.rating ?? null,
    };
  }

  async byDomain(userId: string): Promise<DomainPerformanceDto[]> {
    const rows = await this.prisma.$queryRaw<DomainRow[]>`
      SELECT c."slug" AS slug, c."name" AS name,
             COUNT(*)::int AS attempts,
             COUNT(*) FILTER (WHERE s."isCorrect" IS TRUE)::int AS solved,
             AVG(s."timeSpentSeconds")::float AS avgtime,
             COUNT(*) FILTER (WHERE s."submittedAt" >= NOW() - INTERVAL '30 days')::int AS recentattempts,
             COUNT(*) FILTER (WHERE s."submittedAt" >= NOW() - INTERVAL '30 days' AND s."isCorrect" IS TRUE)::int AS recentsolved
        FROM "submissions" s
        JOIN "problems" p ON p."id" = s."problemId"
        JOIN "categories" c ON c."id" = p."categoryId"
       WHERE s."userId" = ${userId}::uuid
         AND s."status"::text = 'SUBMITTED'
       GROUP BY c."slug", c."name"
       ORDER BY attempts DESC`;
    return rows.map((row) => this.toDomainDto(row));
  }

  async byTopic(userId: string): Promise<TopicPerformanceDto[]> {
    const rows = await this.prisma.$queryRaw<TopicRow[]>`
      SELECT t."slug" AS slug, t."name" AS name,
             c."slug" AS "domainSlug", c."name" AS "domainName",
             COUNT(*)::int AS attempts,
             COUNT(*) FILTER (WHERE s."isCorrect" IS TRUE)::int AS solved,
             AVG(s."timeSpentSeconds")::float AS avgtime,
             COUNT(*) FILTER (WHERE s."submittedAt" >= NOW() - INTERVAL '30 days')::int AS recentattempts,
             COUNT(*) FILTER (WHERE s."submittedAt" >= NOW() - INTERVAL '30 days' AND s."isCorrect" IS TRUE)::int AS recentsolved
        FROM "submissions" s
        JOIN "problems" p ON p."id" = s."problemId"
        JOIN "topics" t ON t."id" = p."topicId"
        JOIN "categories" c ON c."id" = p."categoryId"
       WHERE s."userId" = ${userId}::uuid
         AND s."status"::text = 'SUBMITTED'
       GROUP BY t."slug", t."name", c."slug", c."name"
       ORDER BY attempts DESC`;
    return rows.map((row) => ({
      topicSlug: row.slug,
      topicName: row.name,
      domainSlug: row.domainSlug,
      domainName: row.domainName,
      ...this.bucketStats(row),
    }));
  }

  async byDifficulty(userId: string): Promise<DifficultyPerformanceDto[]> {
    const rows = await this.prisma.$queryRaw<DifficultyRow[]>`
      SELECT p."difficulty"::text AS difficulty,
             COUNT(*)::int AS attempts,
             COUNT(*) FILTER (WHERE s."isCorrect" IS TRUE)::int AS solved,
             AVG(s."timeSpentSeconds")::float AS avgtime,
             COUNT(*) FILTER (WHERE s."submittedAt" >= NOW() - INTERVAL '30 days')::int AS recentattempts,
             COUNT(*) FILTER (WHERE s."submittedAt" >= NOW() - INTERVAL '30 days' AND s."isCorrect" IS TRUE)::int AS recentsolved
        FROM "submissions" s
        JOIN "problems" p ON p."id" = s."problemId"
       WHERE s."userId" = ${userId}::uuid
         AND s."status"::text = 'SUBMITTED'
       GROUP BY p."difficulty"`;
    const order = { EASY: 0, MEDIUM: 1, HARD: 2 };
    return rows
      .map((row) => ({ difficulty: row.difficulty, ...this.bucketStats(row) }))
      .sort((a, b) => order[a.difficulty] - order[b.difficulty]);
  }

  /** Deterministic weak-area detection — no LLM, multi-signal, threshold-gated. */
  async weakAreas(userId: string): Promise<WeakAreaDto[]> {
    const [topics, overall] = await Promise.all([this.byTopic(userId), this.overall(userId)]);
    return topics
      .map((topic) => {
        const scored = scoreWeakArea({
          topicSlug: topic.topicSlug,
          topicName: topic.topicName,
          domainSlug: topic.domainSlug,
          domainName: topic.domainName,
          attempts: topic.attempts,
          accuracy: topic.accuracy === null ? null : topic.accuracy / 100,
          avgTimeSeconds: topic.avgTimeSeconds,
          recentTrend: topic.recentTrend,
          globalAvgTimeSeconds: overall.avgTimeSeconds,
        });
        return { topic, scored };
      })
      .filter(({ scored }) => scored.eligible)
      .sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 };
        if (rank[a.scored.severity] !== rank[b.scored.severity]) {
          return rank[a.scored.severity] - rank[b.scored.severity];
        }
        return (a.topic.accuracy ?? 100) - (b.topic.accuracy ?? 100);
      })
      .map(({ topic, scored }) => ({
        topicSlug: topic.topicSlug,
        topicName: topic.topicName,
        domainSlug: topic.domainSlug,
        domainName: topic.domainName,
        attempts: topic.attempts,
        accuracy: topic.accuracy,
        avgTimeSeconds: topic.avgTimeSeconds,
        recentTrend: topic.recentTrend,
        severity: scored.severity,
        reason: scored.reason,
      }));
  }

  private toDomainDto(row: DomainRow): DomainPerformanceDto {
    return {
      domainSlug: row.slug,
      domainName: row.name,
      ...this.bucketStats(row),
    };
  }

  private bucketStats(row: Omit<DomainRow, 'slug' | 'name'>): {
    attempts: number;
    solved: number;
    accuracy: number | null;
    avgTimeSeconds: number | null;
    recentTrend: number | null;
  } {
    const attempts = Number(row.attempts);
    const solved = Number(row.solved);
    const recentAttempts = Number(row.recentattempts);
    const recentSolved = Number(row.recentsolved);
    const accuracy = accuracyOf(solved, attempts);
    const recentAccuracy = recentAttempts >= 5 ? accuracyOf(recentSolved, recentAttempts) : null;
    return {
      attempts,
      solved,
      accuracy,
      avgTimeSeconds: row.avgtime === null ? null : Math.round(row.avgtime),
      recentTrend:
        accuracy === null || recentAccuracy === null
          ? null
          : Math.round((recentAccuracy - accuracy) * 10) / 10,
    };
  }

  /** Exposed for tests and the coach-tools layer. */
  accuracyOfStat(solved: number, attempted: number): number | null {
    return accuracyOf(solved, attempted);
  }

  averageOfStat(values: Array<number | null | undefined>): number | null {
    return averageOf(values);
  }
}
