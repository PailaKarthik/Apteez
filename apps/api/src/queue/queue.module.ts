import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { ChallengeQueueService } from './challenge-queue.service';
import { CHALLENGE_QUEUE } from './queue.constants';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          url: config.get('REDIS_URL', { infer: true }),
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
        },
        defaultJobOptions: {
          removeOnComplete: { age: 3600, count: 500 },
          removeOnFail: { age: 86_400, count: 1000 },
        },
      }),
    }),
    BullModule.registerQueue({ name: CHALLENGE_QUEUE }),
  ],
  providers: [ChallengeQueueService],
  exports: [BullModule, ChallengeQueueService],
})
export class QueueModule {}
