import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { resolveRedisUrl } from '../config/env';
import { ChallengeQueueService } from './challenge-queue.service';
import { CHALLENGE_QUEUE, EVENT_QUEUE } from './queue.constants';
import { AI_QUEUE } from '../modules/ai/ai.constants';
import { EventQueueService } from './event-queue.service';
import { EventNotificationProcessor } from './event-notification.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        connection: {
          // Same centralized URL as the app client (Upstash in every
          // non-test environment). BullMQ needs the Redis protocol, so this
          // is the TCP/TLS endpoint — never the Upstash REST URL/token.
          url: resolveRedisUrl(
            config.get('UPSTASH_REDIS_URL', { infer: true }),
            config.get('REDIS_URL', { infer: true }),
          ),
          maxRetriesPerRequest: null,
          enableReadyCheck: true,
        },
        defaultJobOptions: {
          // Retries with exponential backoff: transient Redis/PG blips heal
          // without losing work. Non-idempotent producers override attempts:1
          // at enqueue time (see EventQueueService).
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          // A hung provider/embedding call must never hold a worker slot
          // forever; BullMQ fails it into retries instead.
          timeout: 60_000,
          removeOnComplete: { age: 3600, count: 500 },
          removeOnFail: { age: 86_400, count: 1000 },
        },
      }),
    }),
    BullModule.registerQueue({ name: CHALLENGE_QUEUE }),
    BullModule.registerQueue({ name: EVENT_QUEUE }),
    BullModule.registerQueue({ name: AI_QUEUE }),
  ],
  providers: [ChallengeQueueService, EventQueueService, EventNotificationProcessor],
  exports: [BullModule, ChallengeQueueService, EventQueueService],
})
export class QueueModule {}
