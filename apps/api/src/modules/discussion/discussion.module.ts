import { Module } from '@nestjs/common';
import { DiscussionController } from './discussion.controller';
import { DiscussionRepository } from './discussion.repository';
import { DiscussionService } from './discussion.service';

/**
 * Community discussions over the shared taxonomy. Public reads; session-gated
 * mutations. Counters and the accepted-solution flag are server-owned, and
 * moderation reuses the shared permissions system (`discussion.moderate`).
 * `DiscussionService` is exported so notifications/rewards can react to
 * discussion activity without reaching into the repository.
 */
@Module({
  controllers: [DiscussionController],
  providers: [DiscussionRepository, DiscussionService],
  exports: [DiscussionService],
})
export class DiscussionModule {}