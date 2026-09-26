import { Module } from '@nestjs/common';
import { ProfileModule } from '../profile/profile.module';
import { ProblemsModule } from '../problems/problems.module';
import { ContestModule } from '../contest/contest.module';
import { EventsModule } from '../events/events.module';
import { PersonalizationService } from './personalization.service';
import { RecommendationsController } from './recommendations.controller';

/**
 * Deterministic personalization. Reads canonical profile analytics
 * (PerformanceService, ActivityService) and domain list endpoints — it owns
 * no analytics of its own and duplicates no storage. Exported for reuse by
 * future LangGraph tool nodes alongside CoachToolsService.
 */
@Module({
  imports: [ProfileModule, ProblemsModule, ContestModule, EventsModule],
  controllers: [RecommendationsController],
  providers: [PersonalizationService],
  exports: [PersonalizationService],
})
export class RecommendationsModule {}
