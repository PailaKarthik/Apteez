import { Global, Module } from '@nestjs/common';
import { RedisLockService } from './redis-lock.service';
import { RedisService } from './redis.service';

/**
 * Global Redis access: the resilient connection wrapper plus the distributed
 * lock service. Feature modules inject these directly without re-importing.
 */
@Global()
@Module({
  providers: [RedisService, RedisLockService],
  exports: [RedisService, RedisLockService],
})
export class RedisModule {}
