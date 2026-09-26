import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type { AiFeedbackSubmitInput } from '@apteez/validation';
import { AppError } from '../../common/errors/app-error';
import { AppLogger } from '../../common/logger/app-logger';

export class AiFeedbackValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 422);
    this.name = 'AiFeedbackValidationError';
  }
}

/** Verdicts accepted per feature. Anything else is a 422, not silent loss. */
const VERDICTS_BY_FEATURE: Record<string, readonly string[]> = {
  'performance-coach': ['helpful', 'not_helpful'],
  'similar-problems': ['relevant', 'not_relevant'],
  // contribution-review verdicts are written by recordReviewOutcome (admin
  // decisions vs AI recommendations), never by the public endpoint.
  'contribution-review': ['agree', 'disagree'],
};

export interface QualityOverview {
  windowDays: number;
  usage: Array<{
    feature: string;
    calls: number;
    failures: number;
    fallbacks: number;
    fallbackRate: number | null;
    avgLatencyMs: number | null;
    avgToolCount: number | null;
  }>;
  feedback: Array<{ feature: string; verdict: string; count: number }>;
  rag: {
    total: number;
    vector: number;
    lexicalFallback: number;
    empty: number;
    fallbackRate: number | null;
    emptyRate: number | null;
    avgResultCount: number | null;
    avgLatencyMs: number | null;
  };
  review: {
    aiReviews: number;
    recommendationSplit: { APPROVE: number; REVIEW: number; REJECT: number };
    overridesAgree: number;
    overridesDisagree: number;
    deferrals: number;
  };
}

/**
 * AI quality loop: user/admin feedback intake + aggregate quality signals.
 * Feedback rows are advisory signals for evaluation-dataset candidates —
 * they never change prompts, models, or retrieval automatically. Human
 * review is required before any production feedback alters evaluation
 * assumptions (see docs/ai-quality-loop.md).
 */
@Injectable()
export class AiQualityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: AppLogger,
  ) {}

  /** Public signal intake (authenticated users). Strict per-feature verdicts. */
  async recordFeedback(userId: string, input: AiFeedbackSubmitInput): Promise<{ id: string }> {
    const allowed = VERDICTS_BY_FEATURE[input.feature] ?? [];
    if (!allowed.includes(input.verdict)) {
      throw new AiFeedbackValidationError(
        `Verdict '${input.verdict}' is not valid for feature '${input.feature}'.`,
      );
    }
    if (input.feature === 'contribution-review') {
      // Admin-vs-AI outcomes are recorded by recordReviewOutcome only, so a
      // user cannot forge review-quality signals.
      throw new AiFeedbackValidationError(
        'Contribution-review outcomes are recorded from admin decisions only.',
      );
    }
    const created = await this.prisma.aiFeedback.create({
      data: {
        userId,
        feature: input.feature,
        targetId: input.targetId ?? null,
        verdict: input.verdict,
      },
      select: { id: true },
    });
    return { id: created.id };
  }

  /**
   * Admin decision vs latest AI recommendation. Best-effort and silent on
   * failure — review integrity never depends on telemetry. REVIEW
   * recommendations carry no signal (they asked for a human); only exact
   * agreement or direct contradiction is recorded. Admin decisions remain
   * the final ground truth for publication regardless.
   */
  async recordReviewOutcome(input: {
    contributionId: string;
    decision: 'APPROVED' | 'REJECTED';
    reviewerId: string;
  }): Promise<void> {
    try {
      const latest = await this.prisma.contributionAiReview.findFirst({
        where: { contributionId: input.contributionId, model: { startsWith: 'ai-' } },
        orderBy: { createdAt: 'desc' },
        select: { recommendation: true },
      });
      if (!latest) {
        return;
      }
      const recommendation = String(latest.recommendation);
      let verdict: 'agree' | 'disagree' | null = null;
      if (input.decision === 'APPROVED') {
        verdict =
          recommendation === 'APPROVE' ? 'agree' : recommendation === 'REJECT' ? 'disagree' : null;
      } else {
        verdict =
          recommendation === 'REJECT' ? 'agree' : recommendation === 'APPROVE' ? 'disagree' : null;
      }
      if (!verdict) {
        return;
      }
      await this.prisma.aiFeedback.create({
        data: {
          userId: input.reviewerId,
          feature: 'contribution-review',
          targetId: input.contributionId,
          verdict,
        },
      });
    } catch (error) {
      this.logger.warn(
        `ai.quality-override-failed contribution=${input.contributionId} ${error instanceof Error ? error.message : String(error)}`,
        'AI',
      );
    }
  }

  /** Aggregate quality signals for the admin quality dashboard. */
  async overview(days = 30): Promise<QualityOverview> {
    const windowDays = Math.min(90, Math.max(1, Math.trunc(days) || 30));
    const since = new Date(Date.now() - windowDays * 86_400_000);
    const [usageRows, feedbackRows, ragRows, ragAvg, reviewRows, overrideRows, deferrals] =
      await Promise.all([
        this.prisma.aiUsageLog.groupBy({
          by: ['feature'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
          _avg: { latencyMs: true, toolCount: true },
        }),
        this.prisma.aiFeedback.groupBy({
          by: ['feature', 'verdict'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
        }),
        this.prisma.ragRetrievalLog.groupBy({
          by: ['source'],
          where: { createdAt: { gte: since } },
          _count: { _all: true },
        }),
        this.prisma.ragRetrievalLog.aggregate({
          where: { createdAt: { gte: since } },
          _avg: { resultCount: true, latencyMs: true },
        }),
        this.prisma.contributionAiReview.groupBy({
          by: ['recommendation'],
          where: { createdAt: { gte: since }, model: { startsWith: 'ai-' } },
          _count: { _all: true },
        }),
        this.prisma.aiFeedback.groupBy({
          by: ['verdict'],
          where: { createdAt: { gte: since }, feature: 'contribution-review' },
          _count: { _all: true },
        }),
        this.prisma.aiUsageLog.count({
          where: {
            createdAt: { gte: since },
            feature: 'contribution-review',
            model: 'review-deferred',
          },
        }),
      ]);
    const [failures, fallbacks] = await Promise.all([
      this.prisma.aiUsageLog.groupBy({
        by: ['feature'],
        where: { createdAt: { gte: since }, success: false },
        _count: { _all: true },
      }),
      this.prisma.aiUsageLog.groupBy({
        by: ['feature'],
        where: { createdAt: { gte: since }, fallbackUsed: true },
        _count: { _all: true },
      }),
    ]);
    const failedBy = new Map(failures.map((row) => [row.feature, row._count._all]));
    const fallbackBy = new Map(fallbacks.map((row) => [row.feature, row._count._all]));
    const ragBySource = new Map(ragRows.map((row) => [row.source, row._count._all]));
    const ragTotal = [...ragBySource.values()].reduce((sum, count) => sum + count, 0);
    const recommendationSplit = { APPROVE: 0, REVIEW: 0, REJECT: 0 };
    for (const row of reviewRows) {
      const key = String(row.recommendation);
      if (key === 'APPROVE' || key === 'REVIEW' || key === 'REJECT') {
        recommendationSplit[key] += row._count._all;
      }
    }
    const overrideBy = new Map(overrideRows.map((row) => [row.verdict, row._count._all]));
    return {
      windowDays,
      usage: usageRows.map((row) => {
        const calls = row._count._all;
        const fallbackCount = fallbackBy.get(row.feature) ?? 0;
        return {
          feature: row.feature,
          calls,
          failures: failedBy.get(row.feature) ?? 0,
          fallbacks: fallbackCount,
          fallbackRate: calls === 0 ? null : Math.round((fallbackCount / calls) * 1000) / 1000,
          avgLatencyMs: row._avg.latencyMs === null ? null : Math.round(row._avg.latencyMs),
          avgToolCount:
            row._avg.toolCount === null ? null : Math.round(row._avg.toolCount * 10) / 10,
        };
      }),
      feedback: feedbackRows.map((row) => ({
        feature: row.feature,
        verdict: row.verdict,
        count: row._count._all,
      })),
      rag: {
        total: ragTotal,
        vector: ragBySource.get('vector') ?? 0,
        lexicalFallback: ragBySource.get('lexical-fallback') ?? 0,
        empty: ragBySource.get('empty') ?? 0,
        fallbackRate:
          ragTotal === 0
            ? null
            : Math.round(((ragBySource.get('lexical-fallback') ?? 0) / ragTotal) * 1000) / 1000,
        emptyRate:
          ragTotal === 0
            ? null
            : Math.round(((ragBySource.get('empty') ?? 0) / ragTotal) * 1000) / 1000,
        avgResultCount:
          ragAvg._avg.resultCount === null ? null : Math.round(ragAvg._avg.resultCount * 10) / 10,
        avgLatencyMs: ragAvg._avg.latencyMs === null ? null : Math.round(ragAvg._avg.latencyMs),
      },
      review: {
        aiReviews: reviewRows.reduce((sum, row) => sum + row._count._all, 0),
        recommendationSplit,
        overridesAgree: overrideBy.get('agree') ?? 0,
        overridesDisagree: overrideBy.get('disagree') ?? 0,
        deferrals,
      },
    };
  }
}
