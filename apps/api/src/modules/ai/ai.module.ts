import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { ProfileModule } from '../profile/profile.module';
import { AiAdminController } from './ai-admin.controller';
import { AiController } from './ai.controller';
import { AiProcessor } from './ai.processor';
import { AiQualityService } from './ai-quality.service';
import { AiQueueService } from './ai-queue.service';
import { AiToolRegistry } from './ai-tool-registry';
import { AiUsageTrackerService } from './ai-usage-tracker.service';
import { AiEvaluationService } from './evaluations/ai-evaluation.service';
import { EmbeddingService } from './embedding.service';
import { PerformanceCoachService } from './performance-coach.service';
import { StructuredOutputService } from './structured-output.service';
import { provideEmbedding, provideLlm } from './providers';

/**
 * AI application layer. All model access flows through provider abstractions
 * (no vendor SDKs) and every feature degrades to deterministic behavior when
 * unconfigured. The module reads canonical services (CoachToolsService via
 * ProfileModule) and never touches repositories directly — the same boundary
 * the future LangGraph agent will use.
 */
@Module({
  imports: [ProfileModule, QueueModule],
  controllers: [AiAdminController, AiController],
  providers: [
    provideLlm(),
    provideEmbedding(),
    AiEvaluationService,
    AiProcessor,
    AiQualityService,
    AiQueueService,
    AiToolRegistry,
    AiUsageTrackerService,
    EmbeddingService,
    PerformanceCoachService,
    StructuredOutputService,
  ],
  exports: [
    AiEvaluationService,
    AiQualityService,
    AiQueueService,
    AiToolRegistry,
    AiUsageTrackerService,
    EmbeddingService,
    PerformanceCoachService,
  ],
})
export class AiModule {}
