import type { ThrottlerStorage } from '@nestjs/throttler';
import { AppLogger } from '../logger/app-logger';
import { RedisService } from '../../redis/redis.service';

interface ThrottleHit {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Throttler storage backed by Redis (fixed window + optional block), so
 * rate limits hold across instances and restarts. Mirrors the semantics of
 * the default in-memory storage: `ttl`/`blockDuration` arrive in
 * milliseconds, counters reset when the window lapses.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private static readonly SCRIPT = `
    local blocked_until = tonumber(redis.call('HGET', KEYS[1], 'blocked_until') or '0')
    local now = tonumber(ARGV[4])
    if blocked_until > now then
      local pttl = redis.call('PTTL', KEYS[1])
      local hits = tonumber(redis.call('HGET', KEYS[1], 'hits') or '0')
      return {hits, math.ceil(math.max(pttl, 0) / 1000), 1, math.ceil((blocked_until - now) / 1000)}
    end
    local hits = redis.call('HINCRBY', KEYS[1], 'hits', 1)
    if hits == 1 then redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1])) end
    local isBlocked = 0
    local timeToBlockExpire = 0
    local limit = tonumber(ARGV[2])
    local blockDuration = tonumber(ARGV[3])
    if hits > limit and blockDuration > 0 then
      blocked_until = now + blockDuration
      redis.call('HSET', KEYS[1], 'blocked_until', blocked_until)
      local pttl = redis.call('PTTL', KEYS[1])
      if pttl < blockDuration then redis.call('PEXPIRE', KEYS[1], blockDuration) end
      isBlocked = 1
      timeToBlockExpire = math.ceil(blockDuration / 1000)
    end
    local pttl = redis.call('PTTL', KEYS[1])
    return {hits, math.ceil(math.max(pttl, 0) / 1000), isBlocked, timeToBlockExpire}
  `;

  constructor(
    private readonly redis: RedisService,
    private readonly logger: AppLogger,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottleHit> {
    void throttlerName;
    try {
      const result = (await this.redis
        .getClient()
        .eval(
          RedisThrottlerStorage.SCRIPT,
          1,
          key,
          ttl,
          limit,
          blockDuration,
          Date.now(),
        )) as unknown[];
      return {
        totalHits: Number(result[0] ?? 0),
        timeToExpire: Number(result[1] ?? 0),
        isBlocked: Number(result[2] ?? 0) === 1,
        timeToBlockExpire: Number(result[3] ?? 0),
      };
    } catch (error) {
      // Fail open on Redis outages: availability over strictness, and the
      // outage is already visible on /health.
      this.logger.warn(
        `Throttler storage unavailable, allowing request: ${error instanceof Error ? error.message : String(error)}`,
        'Throttler',
      );
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
