import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { RewardsModule } from '../rewards/rewards.module';
import { EventsAdminController } from './events-admin.controller';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { OrganizationsController } from './organizations.controller';

/** Full Events platform: discovery, lifecycle, registration, live play, results, moderation. */
@Module({
  imports: [QueueModule, RewardsModule],
  controllers: [EventsController, EventsAdminController, OrganizationsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
