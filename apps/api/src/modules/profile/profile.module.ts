import { Module } from '@nestjs/common';
import { RatingModule } from '../rating/rating.module';
import { RewardsModule } from '../rewards/rewards.module';
import { AchievementsService } from './achievements.service';
import { ActivityService } from './activity.service';
import { CoachToolsService } from './coach-tools.service';
import { PerformanceService } from './performance.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UsersController } from './users.controller';

/**
 * Profile + performance analytics + streaks + achievements. Read-heavy
 * services over canonical tables; the only writers here are the activity
 * rollup (derived), streak persistence (derived), achievement unlocks and
 * avatar keys. Rating/points engines are never duplicated — they are read
 * (ratings) or called through their sole-writer service (points).
 */
@Module({
  imports: [RatingModule, RewardsModule],
  controllers: [ProfileController, UsersController],
  providers: [
    ProfileService,
    PerformanceService,
    ActivityService,
    AchievementsService,
    CoachToolsService,
  ],
  exports: [
    ProfileService,
    PerformanceService,
    ActivityService,
    AchievementsService,
    CoachToolsService,
  ],
})
export class ProfileModule {}
