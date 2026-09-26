import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { AiModule } from '../ai/ai.module';
import { ContributionModule } from '../contribution/contribution.module';
import { DiscussionModule } from '../discussion/discussion.module';
import { FeedbackModule } from '../feedback/feedback.module';
import { SearchModule } from '../search/search.module';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AdminAuditController } from './admin-audit.controller';
import { AdminAuditService } from './admin-audit.service';
import { AdminContestsController } from './admin-contests.controller';
import { AdminContestsService } from './admin-contests.service';
import { AdminContributionsController } from './admin-contributions.controller';
import { AdminContributionsService } from './admin-contributions.service';
import { AdminDiscussionsController } from './admin-discussions.controller';
import { AdminDiscussionsService } from './admin-discussions.service';
import { AdminFeedbackController } from './admin-feedback.controller';
import { AdminFlagsController } from './admin-flags.controller';
import { AdminOverviewController } from './admin-overview.controller';
import { AdminOverviewService } from './admin-overview.service';
import { AdminRateLimitsController } from './admin-rate-limits.controller';
import { AdminQueuesController } from './admin-queues.controller';
import { AdminQueuesService } from './admin-queues.service';
import { AdminProblemsController } from './admin-problems.controller';
import { AdminProblemsService } from './admin-problems.service';
import { AdminReportsController, ReportsController } from './admin-reports.controller';
import { AdminReportsService } from './admin-reports.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

/**
 * Platform operations. Imports leaf domain modules only for reuse
 * (DiscussionService guards); nothing here duplicates domain storage, and
 * no imported module depends back on admin — the graph stays acyclic.
 * Rewards/points and event admin keep their existing feature-module routes;
 * this module adds users, contributions, problems, reports, discussions,
 * contests, overview and the append-only audit log.
 */
@Module({
  imports: [
    AiModule,
    ContributionModule,
    DiscussionModule,
    FeedbackModule,
    QueueModule,
    SearchModule,
  ],
  controllers: [
    AdminOverviewController,
    AdminUsersController,
    AdminContributionsController,
    AdminProblemsController,
    ReportsController,
    AdminReportsController,
    AdminDiscussionsController,
    AdminContestsController,
    AdminAuditController,
    AdminQueuesController,
    AdminAnalyticsController,
    AdminFeedbackController,
    AdminFlagsController,
    AdminRateLimitsController,
  ],
  providers: [
    AdminAuditService,
    AdminOverviewService,
    AdminQueuesService,
    AdminUsersService,
    AdminContributionsService,
    AdminProblemsService,
    AdminReportsService,
    AdminDiscussionsService,
    AdminContestsService,
  ],
  exports: [AdminAuditService],
})
export class AdminModule {}
