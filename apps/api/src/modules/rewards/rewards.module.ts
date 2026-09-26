import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { PointsService } from './points.service';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';
import { RewardsAdminController } from './rewards-admin.controller';

/**
 * Authoritative points + rewards domain. PointsService is the sole writer of
 * the point ledger and UserPoints mirror; RewardsService owns the catalog and
 * redemptions. QueueModule is imported only for async notifications — balance
 * updates never depend on background jobs.
 */
@Module({
  imports: [QueueModule],
  controllers: [RewardsController, RewardsAdminController],
  providers: [PointsService, RewardsService],
  exports: [PointsService, RewardsService],
})
export class RewardsModule {}
