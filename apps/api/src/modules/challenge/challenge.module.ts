import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { RatingModule } from '../rating/rating.module';
import { UsersModule } from '../users/users.module';
import { ChallengeController } from './challenge.controller';
import { ChallengeCoordinator } from './challenge.coordinator';
import { ChallengeEvents } from './challenge.events';
import { ChallengeGateway } from './challenge.gateway';
import { ChallengeLiveStateService } from './challenge-live-state.service';
import { ChallengeProcessor } from './challenge.processor';
import { ChallengeResultService } from './challenge-result.service';
import { ChallengeRealtime } from './challenge.realtime';
import { ChallengeService } from './challenge.service';
import { MatchmakingService } from './matchmaking.service';

/**
 * 1v1 challenge domain: Redis-backed matchmaking, the server-authoritative
 * challenge engine, ephemeral live state, the BullMQ expiry/cleanup jobs, the
 * Socket.IO transport and the read-only REST surface.
 */
@Module({
  imports: [UsersModule, QueueModule, RatingModule],
  controllers: [ChallengeController],
  providers: [
    MatchmakingService,
    ChallengeEvents,
    ChallengeResultService,
    ChallengeRealtime,
    ChallengeLiveStateService,
    ChallengeService,
    ChallengeCoordinator,
    ChallengeGateway,
    ChallengeProcessor,
  ],
  exports: [ChallengeService, MatchmakingService, ChallengeCoordinator],
})
export class ChallengeModule {}
