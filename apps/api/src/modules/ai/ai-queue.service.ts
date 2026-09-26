import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { getRequestId } from '../../common/context/request-context';
import { AppLogger } from '../../common/logger/app-logger';
import type { Env } from '../../config/env';
import {
  AI_JOBS,
  AI_QUEUE,
  contributionReviewJobId,
  embeddingsBackfillJobId,
  problemEmbedJobId,
  type EmbeddingTripleLike,
} from './ai.constants';
import { NORMALIZATION_VERSION } from './embedding.service';

/**
 * Typed enqueue façade for AI work. Enqueue failures never fail request
 * paths — embedding/review are best-effort background effects with
 * deterministic fallbacks in the foreground.
 */
@Injectable()
export class AiQueueService {
  constructor(
    @InjectQueue(AI_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: AppLogger,
  ) {}

  private triple(): EmbeddingTripleLike {
    return {
      model: this.config.get('EMBEDDING_MODEL', { infer: true }),
      dimensions: this.config.get('EMBEDDING_DIMENSIONS', { infer: true }),
      // Pipeline version (representation), not a model release: retrieval
      // filters this exact triple so versions never mix.
      version: NORMALIZATION_VERSION,
    };
  }

  async enqueueProblemEmbed(problemId: string): Promise<void> {
    const triple = this.triple();
    try {
      await this.queue.add(
        AI_JOBS.problemEmbed,
        { problemId, requestId: getRequestId() ?? undefined },
        { jobId: problemEmbedJobId(problemId, triple) },
      );
    } catch (error) {
      this.logger.warn(
        `queue.ai-embed-failed problem=${problemId} ${error instanceof Error ? error.message : String(error)}`,
        'AI',
      );
    }
  }

  /**
   * Start (or re-enter) the embeddings backfill chain for the active triple.
   * Deterministic job id collapses concurrent triggers into one chain.
   */
  async enqueueBackfill(): Promise<{ enqueued: boolean; jobId: string }> {
    const triple = this.triple();
    const jobId = embeddingsBackfillJobId(triple);
    try {
      const job = await this.queue.add(
        AI_JOBS.embeddingsBackfill,
        { cursor: null as string | null, requestId: getRequestId() ?? undefined },
        { jobId },
      );
      return { enqueued: true, jobId: String(job.id ?? jobId) };
    } catch (error) {
      this.logger.warn(
        `queue.ai-backfill-failed ${error instanceof Error ? error.message : String(error)}`,
        'AI',
      );
      return { enqueued: false, jobId };
    }
  }

  async enqueueContributionReview(contributionId: string): Promise<void> {
    try {
      await this.queue.add(
        AI_JOBS.contributionReview,
        { contributionId, requestId: getRequestId() ?? undefined },
        { jobId: contributionReviewJobId(contributionId) },
      );
    } catch (error) {
      this.logger.warn(
        `queue.ai-review-failed contribution=${contributionId} ${error instanceof Error ? error.message : String(error)}`,
        'AI',
      );
    }
  }
}
