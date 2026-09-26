import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import { ActivityService } from './activity.service';
import { PerformanceService } from './performance.service';

/**
 * Controlled tool boundary for the future AI Performance Coach.
 *
 * Eventual architecture: NestJS → AI application layer → LangGraph.js →
 * LangChain.js tools → THE METHODS BELOW → PostgreSQL. The model must never
 * query the database directly and never receives SQL access: every future
 * tool node calls one of these JSON-serializable functions, which reuse the
 * same services that power the profile UI (no duplicated logic, no second
 * analytics path).
 *
 * No LLM is invoked here — this file only exposes deterministic data tools.
 */
@Injectable()
export class CoachToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly performance: PerformanceService,
    private readonly activity: ActivityService,
  ) {}

  /** Overall + per-domain performance for a user. */
  async getUserPerformance(userId: string): Promise<{
    overall: Awaited<ReturnType<PerformanceService['overall']>>;
    domains: Awaited<ReturnType<PerformanceService['byDomain']>>;
  }> {
    const [overall, domains] = await Promise.all([
      this.performance.overall(userId),
      this.performance.byDomain(userId),
    ]);
    return { overall, domains };
  }

  /** Per-topic performance, optionally narrowed to one topic. */
  async getTopicPerformance(userId: string, topicSlug?: string): Promise<unknown> {
    const topics = await this.performance.byTopic(userId);
    return topicSlug ? (topics.find((topic) => topic.topicSlug === topicSlug) ?? null) : topics;
  }

  /** Recent finalized submissions with taxonomy context (no correct answers). */
  async getRecentSubmissions(userId: string, limit = 50): Promise<unknown> {
    const capped = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.submission.findMany({
      where: { userId, status: 'SUBMITTED' },
      orderBy: [{ submittedAt: 'desc' }],
      take: capped,
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
            category: { select: { slug: true, name: true } },
            topic: { select: { slug: true, name: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      problemId: row.problem.id,
      problemTitle: row.problem.title,
      difficulty: row.problem.difficulty,
      category: row.problem.category,
      topic: row.problem.topic,
      isCorrect: row.isCorrect,
      timeSpentSeconds: row.timeSpentSeconds,
      submittedAt: row.submittedAt?.toISOString() ?? null,
    }));
  }

  /** Rated challenge history (engine-owned rows, read-only here). */
  async getChallengeHistory(userId: string, limit = 50): Promise<unknown> {
    const capped = Math.min(Math.max(limit, 1), 100);
    return this.prisma.challengeRatingHistory.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
      take: capped,
      select: {
        challengeId: true,
        domainSlug: true,
        result: true,
        score: true,
        opponentScore: true,
        ratingBefore: true,
        ratingAfter: true,
        ratingChange: true,
        createdAt: true,
      },
    });
  }

  /** Contest results with contest context. */
  async getContestHistory(userId: string, limit = 20): Promise<unknown> {
    const capped = Math.min(Math.max(limit, 1), 50);
    return this.prisma.contestResult.findMany({
      where: { userId },
      orderBy: [{ finalizedAt: 'desc' }],
      take: capped,
      select: {
        score: true,
        rank: true,
        finalizedAt: true,
        contest: { select: { id: true, title: true, difficulty: true } },
      },
    });
  }

  /** Learning progress summary + recently touched lessons. */
  async getLearningProgress(userId: string): Promise<unknown> {
    const [started, completed, recent] = await Promise.all([
      this.prisma.userLearningProgress.count({ where: { userId, status: 'STARTED' } }),
      this.prisma.userLearningProgress.count({ where: { userId, status: 'COMPLETED' } }),
      this.prisma.userLearningProgress.findMany({
        where: { userId },
        orderBy: [{ lastViewedAt: 'desc' }],
        take: 10,
        select: {
          status: true,
          lastViewedAt: true,
          lesson: { select: { title: true, difficulty: true } },
        },
      }),
    ]);
    return { started, completed, recent };
  }

  /** Deterministic weak areas (multi-signal, threshold-gated). */
  async getWeakAreas(userId: string): Promise<unknown> {
    return this.performance.weakAreas(userId);
  }

  /**
   * Canonical published problems for a topic — the future Similar Problems
   * RAG pipeline retrieves from this same set (id, title, content, taxonomy,
   * difficulty, rating, exam tags, published state) via pgvector + metadata
   * filtering. No synthetic questions are ever generated here.
   */
  async getProblemsForTopic(topicSlug: string, limit = 20): Promise<unknown> {
    const capped = Math.min(Math.max(limit, 1), 50);
    return this.prisma.problem.findMany({
      where: { topic: { slug: topicSlug }, status: 'PUBLISHED' },
      orderBy: [{ rating: 'asc' }],
      take: capped,
      select: {
        id: true,
        title: true,
        difficulty: true,
        rating: true,
        subtopic: { select: { slug: true, name: true } },
        exams: { select: { examTag: { select: { slug: true, name: true } } } },
      },
    });
  }

  /** Streak + heatmap recap for motivational context. */
  async getActivityRecap(userId: string): Promise<unknown> {
    const [streak, heatmap] = await Promise.all([
      this.activity.streak(userId),
      this.activity.heatmap(userId, 30),
    ]);
    return { streak, last30Days: heatmap };
  }
}
