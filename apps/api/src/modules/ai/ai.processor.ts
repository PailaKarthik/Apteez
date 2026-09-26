import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import { PrismaService } from '@apteez/database';
import { runWithJobRequestId } from '../../common/context/request-context';
import { AppLogger } from '../../common/logger/app-logger';
import { FeatureFlagsService } from '../../config/feature-flags';
import {
  AI_JOBS,
  AI_QUEUE,
  EMBEDDING_BACKFILL_PAGE_SIZE,
  embeddingsBackfillJobId,
  problemEmbedJobId,
} from './ai.constants';
import { contributionReviewResponseSchema } from './coach.schemas';
import { EmbeddingService } from './embedding.service';
import type { LLMProvider } from './llm-provider';
import { LLM_PROVIDER } from './providers';
import { StructuredOutputService } from './structured-output.service';
import { AiUsageTrackerService } from './ai-usage-tracker.service';

interface ProblemEmbedJob {
  problemId?: string;
  requestId?: string;
}

interface ContributionReviewJob {
  contributionId?: string;
  requestId?: string;
}

interface EmbeddingsBackfillJob {
  cursor?: string | null;
  requestId?: string;
}

/**
 * Asynchronous AI worker. Embedding jobs keep vectors fresh without blocking
 * CRUD; review jobs run the LLM reviewer when the flag is on and a provider
 * is configured, otherwise deferring to manual review. Storage always goes
 * through the advisory-only boundary — a review row can never publish.
 * Every handler is idempotent by job id + row upserts, so restarts and
 * redeliveries are safe.
 */
export const AI_REVIEWER_MODEL = 'ai-reviewer-v1';

@Processor(AI_QUEUE)
export class AiProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingService,
    private readonly usage: AiUsageTrackerService,
    private readonly structured: StructuredOutputService,
    private readonly flags: FeatureFlagsService,
    @Inject(LLM_PROVIDER) private readonly llm: LLMProvider,
    @InjectQueue(AI_QUEUE) private readonly queue: Queue,
    private readonly logger: AppLogger,
  ) {
    super();
  }

  async process(
    job: Job<ProblemEmbedJob & ContributionReviewJob & EmbeddingsBackfillJob>,
  ): Promise<void> {
    // Trace one request across API → queue → worker: logs, usage rows and
    // Sentry breadcrumbs inside the handlers carry the originating id.
    return runWithJobRequestId(job.data, () => this.dispatch(job));
  }

  private async dispatch(
    job: Job<ProblemEmbedJob & ContributionReviewJob & EmbeddingsBackfillJob>,
  ): Promise<void> {
    switch (job.name) {
      case AI_JOBS.problemEmbed:
        await this.handleProblemEmbed(job as Job<ProblemEmbedJob>);
        return;
      case AI_JOBS.contributionReview:
        await this.handleContributionReview(job as Job<ContributionReviewJob>);
        return;
      case AI_JOBS.embeddingsBackfill:
        await this.handleEmbeddingsBackfill(job as Job<EmbeddingsBackfillJob>);
        return;
      default:
        this.logger.warn(`ai.job.unknown name=${job.name} job=${job.id ?? 'unknown'}`, 'AI');
    }
  }

  private async handleProblemEmbed(job: Job<ProblemEmbedJob>): Promise<void> {
    const problemId = job.data.problemId;
    if (!problemId) {
      return;
    }
    try {
      await this.embeddings.embedProblem(problemId);
    } catch (error) {
      this.logger.warn(
        `ai.job.failed name=${job.name} job=${job.id ?? 'unknown'} attempts=${job.attemptsMade} ${error instanceof Error ? error.message : String(error)}`,
        'AI',
      );
      throw error;
    }
  }

  /**
   * Controlled backfill: one page of PUBLISHED problems missing a READY
   * embedding for the active triple is enqueued per run, then the next page
   * chains with a cursor. Pages (not the whole table) stay in memory;
   * per-problem deterministic job ids make every page idempotent; progress
   * is visible on the job and failures stay inspectable in the queue.
   */
  private async handleEmbeddingsBackfill(job: Job<EmbeddingsBackfillJob>): Promise<void> {
    const triple = this.embeddings.activeTriple();
    const cursor = job.data.cursor ?? null;
    const page = await this.prisma.problem.findMany({
      where: {
        status: 'PUBLISHED',
        ...(cursor ? { id: { gt: cursor } } : {}),
        embedding: { is: null },
      },
      orderBy: { id: 'asc' },
      take: EMBEDDING_BACKFILL_PAGE_SIZE + 1,
      select: { id: true },
    });
    // Stale non-READY rows are swept once at chain start (cursor null) so
    // later pages never re-scan them.
    const stale =
      cursor === null
        ? await this.prisma.problemEmbedding.findMany({
            where: { status: { not: 'READY' }, problem: { status: 'PUBLISHED' } },
            orderBy: { problemId: 'asc' },
            take: EMBEDDING_BACKFILL_PAGE_SIZE,
            select: { problemId: true },
          })
        : [];
    const ids = [
      ...new Set([
        ...page.slice(0, EMBEDDING_BACKFILL_PAGE_SIZE).map((row) => row.id),
        ...stale.map((row) => row.problemId),
      ]),
    ];
    for (const problemId of ids) {
      await this.queue.add(
        AI_JOBS.problemEmbed,
        { problemId, requestId: job.data.requestId },
        { jobId: problemEmbedJobId(problemId, triple) },
      );
    }
    const nextCursor =
      page.length > EMBEDDING_BACKFILL_PAGE_SIZE ? page[page.length - 1]?.id : null;
    await job.updateProgress({ enqueued: ids.length, cursor, nextCursor });
    this.logger.log(
      `ai.backfill.page enqueued=${ids.length} cursor=${cursor ?? 'start'} next=${nextCursor ?? 'done'}`,
      'AI',
    );
    if (nextCursor) {
      // Per-page job id: unique per page, idempotent per page on retry.
      // A duplicate add (page already chained) is harmless — catch and move on.
      try {
        await this.queue.add(
          AI_JOBS.embeddingsBackfill,
          { cursor: nextCursor, requestId: job.data.requestId },
          { jobId: `${embeddingsBackfillJobId(triple)}_page_${nextCursor}` },
        );
      } catch (error) {
        this.logger.warn(
          `ai.backfill.chain-skipped cursor=${nextCursor} ${error instanceof Error ? error.message : String(error)}`,
          'AI',
        );
      }
    }
  }

  private async handleContributionReview(job: Job<ContributionReviewJob>): Promise<void> {
    const contributionId = job.data.contributionId;
    if (!contributionId) {
      return;
    }
    const startedAt = Date.now();
    const contribution = await this.prisma.contribution.findUnique({
      where: { id: contributionId },
      select: {
        id: true,
        status: true,
        title: true,
        statement: true,
        options: true,
        explanation: true,
        difficulty: true,
        topic: { select: { name: true } },
      },
    });
    if (
      !contribution ||
      (contribution.status !== 'PENDING' && contribution.status !== 'UNDER_REVIEW')
    ) {
      // Decided or gone: nothing to review. No usage row — no review ran.
      return;
    }
    if (!this.flags.isEnabled('AI_CONTRIBUTION_REVIEW') || !this.llm.isConfigured()) {
      // Kill-switch off or no provider: contributions stay PENDING and admins
      // review manually. Recording the attempt keeps the job visible instead
      // of silently vanishing — the usage row feeds the review-quality
      // dashboard with an honest deferral signal.
      await this.usage.record({
        feature: 'contribution-review',
        model: 'review-deferred',
        latencyMs: Date.now() - startedAt,
        success: true,
        requestId: job.data.requestId ?? null,
        error: 'Deferred to manual review (LLM reviewer not enabled).',
      });
      this.logger.log(
        `ai.review.deferred contribution=${contributionId} status=${contribution.status}`,
        'AI',
      );
      return;
    }
    await this.runReviewer(job, contributionId, contribution, startedAt);
  }

  /**
   * LLM contribution reviewer. Reads the frozen submission, calls the model
   * with a Zod-validated structured-output gate (one repair retry), and
   * stores the result as an advisory `ai-reviewer-v1` row. The contribution
   * stays PENDING — only a human approve() can publish. Failures (provider
   * or validation) record a failure usage row and return: the submission
   * waits for manual review rather than retrying blindly.
   */
  private async runReviewer(
    job: Job<ContributionReviewJob>,
    contributionId: string,
    contribution: {
      title: string;
      statement: string;
      options: unknown;
      explanation: string | null;
      difficulty: string | null;
      topic: { name: string } | null;
    },
    startedAt: number,
  ): Promise<void> {
    const recordFailure = async (error: string): Promise<void> => {
      await this.usage.record({
        feature: 'contribution-review',
        model: AI_REVIEWER_MODEL,
        latencyMs: Date.now() - startedAt,
        success: false,
        requestId: job.data.requestId ?? null,
        error: error.slice(0, 500),
      });
    };
    let precheck: { duplicateProbability: number | null; issues: unknown } | null = null;
    try {
      precheck = await this.prisma.contributionAiReview.findFirst({
        where: { contributionId, model: 'precheck-v1' },
        orderBy: { createdAt: 'desc' },
        select: { duplicateProbability: true, issues: true },
      });
    } catch (error) {
      this.logger.warn(
        `ai.review.precheck-unavailable contribution=${contributionId} ${error instanceof Error ? error.message : String(error)}`,
        'AI',
      );
    }
    const options = (Array.isArray(contribution.options) ? contribution.options : []) as Array<{
      text?: unknown;
      isCorrect?: unknown;
    }>;
    const optionLines = options
      .slice(0, 6)
      .map((option, index) => {
        const text = typeof option.text === 'string' ? option.text.slice(0, 500) : '[image option]';
        const flagged = option.isCorrect === true ? ' [flagged correct]' : '';
        return `${index + 1}. ${text}${flagged}`;
      })
      .join('\n');
    const result = await this.structured.generate(
      this.llm,
      contributionReviewResponseSchema,
      [
        {
          role: 'system',
          content:
            'You review candidate aptitude questions for a human moderator. ' +
            'Reply with ONLY a JSON object matching the required schema: topic (taxonomy topic name), ' +
            'subtopic or null, difficulty (EASY/MEDIUM/HARD), duplicateProbability 0-1, ' +
            'answerConsistent (does the flagged answer actually answer the question and match the explanation), ' +
            'issues (concrete problems, empty when clean), recommendation (APPROVE only when clean and correct, ' +
            'REJECT when wrong/unsalvageable, otherwise REVIEW). Advisory only — you publish nothing.',
        },
        {
          role: 'user',
          content: [
            `Title: ${contribution.title.slice(0, 200)}`,
            `Question: ${contribution.statement.slice(0, 4000)}`,
            `Options:\n${optionLines}`,
            `Explanation: ${(contribution.explanation ?? '').slice(0, 2000)}`,
            `Submitted difficulty: ${contribution.difficulty ?? 'unknown'}`,
            `Submitted topic hint: ${contribution.topic?.name ?? 'none'}`,
            precheck
              ? `Deterministic precheck: duplicateProbability=${precheck.duplicateProbability ?? 'unknown'}, issues=${JSON.stringify(precheck.issues).slice(0, 1000)}`
              : 'No deterministic precheck available.',
          ].join('\n'),
        },
      ],
      { maxTokens: 1024, feature: 'contribution-review' },
    );
    if (!result.ok || !result.value) {
      this.logger.warn(
        `ai.review.failed contribution=${contributionId} error=${result.error ?? 'unknown'}`,
        'AI',
      );
      await recordFailure(result.error ?? 'Structured output validation failed.');
      return;
    }
    const value = result.value;
    await this.prisma.contributionAiReview.create({
      data: {
        contributionId,
        model: AI_REVIEWER_MODEL,
        suggestedTopic: value.topic,
        suggestedSubtopic: value.subtopic,
        suggestedDifficulty: value.difficulty,
        duplicateProbability: value.duplicateProbability,
        answerConsistent: value.answerConsistent,
        issues: value.issues as unknown as object,
        recommendation: value.recommendation,
      },
    });
    await this.usage.record({
      feature: 'contribution-review',
      model: AI_REVIEWER_MODEL,
      latencyMs: Date.now() - startedAt,
      success: true,
      requestId: job.data.requestId ?? null,
    });
    this.logger.log(
      `ai.review.stored contribution=${contributionId} recommendation=${value.recommendation}`,
      'AI',
    );
  }
}
