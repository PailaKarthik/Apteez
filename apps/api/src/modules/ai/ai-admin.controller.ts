import { Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { callerOf, requireArea } from '../admin/admin-access';
import { AiQueueService } from './ai-queue.service';
import { AiQualityService } from './ai-quality.service';
import { AiEvaluationService } from './evaluations/ai-evaluation.service';
import { AiUsageTrackerService } from './ai-usage-tracker.service';
import { EmbeddingService } from './embedding.service';

/** Admin visibility into AI evaluation runs and usage telemetry. */
@Controller('admin/ai')
export class AiAdminController {
  constructor(
    private readonly evaluations: AiEvaluationService,
    private readonly usageTracker: AiUsageTrackerService,
    private readonly queue: AiQueueService,
    private readonly quality: AiQualityService,
    private readonly embeddings: EmbeddingService,
  ) {}

  @Get('evaluations')
  async run(@CurrentUser() user?: RequestUser) {
    requireArea(callerOf(user), 'analytics');
    return this.evaluations.runAll();
  }

  @Get('usage')
  async usage(@CurrentUser() user?: RequestUser) {
    requireArea(callerOf(user), 'analytics');
    return { items: await this.usageTracker.summary(30) };
  }

  /**
   * Aggregate quality signals: usage success/fallback rates, user feedback
   * verdicts, RAG retrieval/fallback rates, and review override/deferral
   * counts. Signals for investigation — never objective quality scores.
   */
  @Get('quality')
  async qualityOverview(
    @Query('days') daysRaw: string | undefined,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'analytics');
    const days = daysRaw === undefined ? 30 : Number(daysRaw);
    return this.quality.overview(Number.isFinite(days) ? days : 30);
  }

  /**
   * Start the embeddings backfill chain for the active triple. Collapses
   * into the single running chain when one exists; progress is visible on
   * the BullMQ job and failures stay inspectable via /admin/queues.
   * `?dryRun=true` previews counts (missing/stale/ready) without enqueueing
   * anything — always preview before a production run.
   */
  @Post('embeddings/backfill')
  async backfill(
    @Query('dryRun') dryRunRaw: string | undefined,
    @CurrentUser() user?: RequestUser,
  ) {
    requireArea(callerOf(user), 'analytics');
    if (dryRunRaw === 'true') {
      return { dryRun: true, ...(await this.embeddings.backfillPreview()) };
    }
    return this.queue.enqueueBackfill();
  }
}
