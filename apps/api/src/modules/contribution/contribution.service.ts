import { Injectable } from '@nestjs/common';
import { PrismaService } from '@apteez/database';
import type {
  ContributionDetailDto,
  ContributionMineItemDto,
  ContributionMinePageDto,
} from '@apteez/types';
import type { ContributionQuestionInput } from '@apteez/validation';
import { AppLogger } from '../../common/logger/app-logger';
import { FeatureFlagsService } from '../../config/feature-flags';
import { AiQueueService } from '../ai/ai-queue.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ContributionNotFoundError, ContributionStateError } from './contribution.errors';
import { ContributionPrecheckService } from './contribution-precheck.service';

export interface ContributionOption {
  text: string | null;
  assetKey: string | null;
  isCorrect: boolean;
}

/**
 * User-owned contribution lifecycle. Submit validates the canonical question
 * shape, normalizes the frozen option set (injecting the flagged answer from
 * correctAnswerIndex), and links a taxonomy topic when the free-text topic
 * matches. Review transitions live in AdminContributionsService — this
 * service never approves, publishes, or exposes staff notes.
 */
@Injectable()
export class ContributionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiQueue: AiQueueService,
    private readonly analytics: AnalyticsService,
    private readonly flags: FeatureFlagsService,
    private readonly logger: AppLogger,
    private readonly precheck: ContributionPrecheckService,
  ) {}

  async submit(
    input: ContributionQuestionInput,
    userId: string,
  ): Promise<{ id: string; status: string }> {
    // Product kill-switch: when community contributions are disabled, the
    // submission surface is closed server-side (reads still work).
    this.flags.requireEnabled('COMMUNITY_CONTRIBUTIONS', { userId });
    const options: ContributionOption[] = input.options.map((option, index) => ({
      text: option.text ?? null,
      assetKey: option.assetKey ?? null,
      isCorrect: index === input.correctAnswerIndex,
    }));
    const category = await this.prisma.category.findFirst({
      where: { slug: input.categorySlug, isActive: true },
      select: { id: true },
    });
    if (!category) {
      throw new ContributionStateError(`Unknown or inactive section: ${input.categorySlug}.`);
    }
    let topicId: string | null = null;
    if (input.topic) {
      const topic = await this.prisma.topic.findFirst({
        where: {
          name: { equals: input.topic, mode: 'insensitive' },
          categoryId: category.id,
        },
        select: { id: true },
      });
      topicId = topic?.id ?? null;
    }
    const examTagSlugs = [...new Set(input.examTagSlugs ?? [])];
    if (examTagSlugs.length > 0) {
      const tags = await this.prisma.examTag.findMany({
        where: { slug: { in: examTagSlugs }, isActive: true },
        select: { slug: true },
      });
      const missing = examTagSlugs.filter((slug) => !tags.some((tag) => tag.slug === slug));
      if (missing.length > 0) {
        throw new ContributionStateError(`Unknown or inactive exam tags: ${missing.join(', ')}.`);
      }
    }
    const title =
      input.statement.split(/\s+/).slice(0, 12).join(' ').slice(0, 90) || 'Untitled contribution';
    const created = await this.prisma.contribution.create({
      data: {
        contributorId: userId,
        title,
        statement: input.statement,
        options: options as unknown as object,
        explanation: input.explanation,
        difficulty: input.difficulty,
        categoryId: category.id,
        rating: input.rating ?? 1500,
        examTags: examTagSlugs as unknown as object,
        source: input.source?.trim() || null,
        topicId,
        sourceUrl: input.sourceUrl || null,
        status: 'PENDING',
      },
      select: { id: true, status: true },
    });
    // Best-effort AI review scheduling. The contribution stays PENDING and
    // fully reviewable by humans whether or not this job ever runs. When the
    // AI_CONTRIBUTION_REVIEW flag is off, no review is scheduled at all —
    // the row waits for manual review by design.
    if (this.flags.isEnabled('AI_CONTRIBUTION_REVIEW', { userId })) {
      void this.aiQueue.enqueueContributionReview(created.id).catch(() => undefined);
    }
    void this.analytics.record('contribution.submitted', { userId, metadata: {} });
    // Reviewers never poll: page them in their inbox the moment a submission
    // lands (durable DB rows, never queue-dependent, never failing submit).
    void this.notifyReviewers(created.id, title, userId).catch(() => undefined);
    // Deterministic precheck runs on the fresh row in the background, so the
    // reviewer opens an already-analyzed submission. Never fails submit.
    void this.precheck.runPrecheck(created.id).catch((error: unknown) => {
      this.logger.warn(
        `contribution.precheck-failed id=${created.id} ${error instanceof Error ? error.message : String(error)}`,
        'Contribution',
      );
    });
    return { id: created.id, status: created.status };
  }

  /**
   * Inbox fan-out to every admin (all admins hold review rights).
   * Bounded and best-effort — submit already succeeded before this runs.
   */
  private async notifyReviewers(
    contributionId: string,
    title: string,
    contributorId: string,
  ): Promise<void> {
    try {
      const holders = await this.prisma.userRole.findMany({
        where: { role: { name: 'admin' } },
        select: { userId: true },
        take: 25,
      });
      const userIds = [...new Set(holders.map((h) => h.userId))].filter(
        (id) => id !== contributorId,
      );
      if (userIds.length === 0) {
        return;
      }
      await this.prisma.notification.createMany({
        data: userIds.map((userId) => ({
          userId,
          type: 'CONTRIBUTION_SUBMITTED',
          title: 'New contribution needs review.',
          body: `"${title.slice(0, 120)}" is waiting in the review queue.`,
        })),
      });
      this.logger.log(
        `contribution.reviewers-notified id=${contributionId} reviewers=${userIds.length}`,
        'Contribution',
      );
    } catch (error) {
      this.logger.warn(
        `contribution.notify-failed id=${contributionId} ${error instanceof Error ? error.message : String(error)}`,
        'Contribution',
      );
    }
  }

  /**
   * Revise your own PENDING contribution (e.g. after reviewer feedback) and
   * keep it in the queue — no resubmission round-trip needed. Anything
   * already picked up or decided is immutable to the contributor.
   */
  async resubmit(
    id: string,
    input: ContributionQuestionInput,
    userId: string,
  ): Promise<{ id: string; status: string }> {
    const existing = await this.prisma.contribution.findFirst({
      where: { id, contributorId: userId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new ContributionNotFoundError();
    }
    if (existing.status !== 'PENDING') {
      throw new ContributionStateError(
        existing.status === 'UNDER_REVIEW'
          ? 'A reviewer is looking at this now — wait for their decision.'
          : 'Decided contributions cannot be edited.',
      );
    }
    const options: ContributionOption[] = input.options.map((option, index) => ({
      text: option.text ?? null,
      assetKey: option.assetKey ?? null,
      isCorrect: index === input.correctAnswerIndex,
    }));
    const category = await this.prisma.category.findFirst({
      where: { slug: input.categorySlug, isActive: true },
      select: { id: true },
    });
    if (!category) {
      throw new ContributionStateError(`Unknown or inactive section: ${input.categorySlug}.`);
    }
    let topicId: string | null = null;
    if (input.topic) {
      const topic = await this.prisma.topic.findFirst({
        where: {
          name: { equals: input.topic, mode: 'insensitive' },
          categoryId: category.id,
        },
        select: { id: true },
      });
      topicId = topic?.id ?? null;
    }
    const examTagSlugs = [...new Set(input.examTagSlugs ?? [])];
    if (examTagSlugs.length > 0) {
      const tags = await this.prisma.examTag.findMany({
        where: { slug: { in: examTagSlugs }, isActive: true },
        select: { slug: true },
      });
      const missing = examTagSlugs.filter((slug) => !tags.some((tag) => tag.slug === slug));
      if (missing.length > 0) {
        throw new ContributionStateError(`Unknown or inactive exam tags: ${missing.join(', ')}.`);
      }
    }
    const title =
      input.statement.split(/\s+/).slice(0, 12).join(' ').slice(0, 90) || 'Untitled contribution';
    const updated = await this.prisma.contribution.update({
      where: { id: existing.id },
      data: {
        title,
        statement: input.statement,
        options: options as unknown as object,
        explanation: input.explanation,
        difficulty: input.difficulty,
        categoryId: category.id,
        rating: input.rating ?? 1500,
        examTags: examTagSlugs as unknown as object,
        source: input.source?.trim() || null,
        topicId,
        sourceUrl: input.sourceUrl || null,
      },
      select: { id: true, status: true },
    });
    // Old AI reviews describe the previous content — keeping them would show
    // stale verdicts next to the new text. They are advisory and reproducible,
    // so drop them and schedule a fresh analysis instead of merging eras.
    await this.prisma.contributionAiReview.deleteMany({ where: { contributionId: existing.id } });
    if (this.flags.isEnabled('AI_CONTRIBUTION_REVIEW', { userId })) {
      void this.aiQueue.enqueueContributionReview(existing.id).catch(() => undefined);
    }
    return { id: updated.id, status: updated.status };
  }

  async mine(userId: string, page: number, pageSize: number): Promise<ContributionMinePageDto> {
    const [total, rows] = await Promise.all([
      this.prisma.contribution.count({ where: { contributorId: userId } }),
      this.prisma.contribution.findMany({
        where: { contributorId: userId },
        orderBy: [{ submittedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          status: true,
          feedbackForContributor: true,
          resultingProblemId: true,
          submittedAt: true,
        },
      }),
    ]);
    const items: ContributionMineItemDto[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      feedback: row.feedbackForContributor,
      resultingProblemId: row.resultingProblemId,
      submittedAt: row.submittedAt.toISOString(),
    }));
    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** Owner-safe detail: feedback visible, staff notes and flags never. */
  async detailForUser(id: string, userId: string): Promise<ContributionDetailDto> {
    const row = await this.prisma.contribution.findFirst({
      where: { id, contributorId: userId },
      select: {
        id: true,
        title: true,
        statement: true,
        options: true,
        explanation: true,
        difficulty: true,
        category: { select: { name: true, slug: true } },
        rating: true,
        examTags: true,
        source: true,
        topic: { select: { name: true } },
        sourceUrl: true,
        status: true,
        feedbackForContributor: true,
        resultingProblemId: true,
        submittedAt: true,
        reviewedAt: true,
      },
    });
    if (!row) {
      throw new ContributionNotFoundError();
    }
    const options = (
      row.options as unknown as Array<{ text?: string | null; assetKey?: string | null }>
    ).map((option) => ({ text: option.text ?? null, assetKey: option.assetKey ?? null }));
    return {
      id: row.id,
      title: row.title,
      statement: row.statement,
      options,
      explanation: row.explanation,
      difficulty: row.difficulty,
      categorySlug: row.category?.slug ?? null,
      categoryName: row.category?.name ?? null,
      topicName: row.topic?.name ?? null,
      rating: row.rating,
      examTagSlugs: Array.isArray(row.examTags) ? (row.examTags as string[]) : [],
      source: row.source,
      sourceUrl: row.sourceUrl,
      status: row.status,
      feedback: row.feedbackForContributor,
      resultingProblemId: row.resultingProblemId,
      submittedAt: row.submittedAt.toISOString(),
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
    };
  }
}
