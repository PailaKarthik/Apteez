import { Module } from '@nestjs/common';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';

/**
 * Structured learning over the shared taxonomy. Public reads are anonymous;
 * progress requires auth and is server-owned. `LearningService` is exported
 * so future AI/personalization workflows (Prompt 12 extension points) consume
 * the same curated content and progress data without touching controllers.
 */
@Module({
  controllers: [LearningController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
