import { Module } from '@nestjs/common';
import { RewardsModule } from '../rewards/rewards.module';
import { ContestController } from './contest.controller';
import { ContestRatingCalculator } from './contest-rating.calculator';
import { ContestRepository } from './contest.repository';
import { ContestService } from './contest.service';

/**
 * Boundary for scheduled contests. The engine (ContestService) is
 * server-authoritative: lifecycle transitions, timers, scoring, ranking and
 * the isolated Contest Rating all live here. Organizer/admin creation and
 * moderation reuse this same service later via the permissions system, which
 * is why mutations accept an injected user rather than assuming a role.
 */
@Module({
  imports: [RewardsModule],
  controllers: [ContestController],
  providers: [ContestRatingCalculator, ContestRepository, ContestService],
  exports: [ContestService],
})
export class ContestModule {}
