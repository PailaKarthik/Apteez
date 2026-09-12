import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppLogger } from '../common/logger/app-logger';
import { redisKeys } from './redis-keys';
import { RedisService } from './redis.service';

/**
 * Distributed lock built on Redis `SET NX PX` with a random owner token.
 *
 * Release is a compare-and-delete Lua script, so a lock is only ever released
 * by the process that acquired it — a slow holder cannot delete a newer
 * lock. Locks always carry a TTL, so a crashed holder self-heals instead of
 * deadlocking the domain forever.
 *
 * This lock protects *coordination* (who may create a match / finalize a
 * challenge). PostgreSQL constraints remain the ultimate correctness guard.
 */
@Injectable()
export class RedisLockService {
  private static readonly RELEASE_SCRIPT = `
    if redis.call('get', KEYS[1]) == ARGV[1] then
      return redis.call('del', KEYS[1])
    end
    return 0
  `;

  constructor(
    private readonly redis: RedisService,
    private readonly logger: AppLogger,
  ) {}

  /** Acquire a lock; resolves with the owner token, or null when held. */
  async acquire(name: string, ttlMs: number): Promise<string | null> {
    await this.redis.requireReady();
    const token = randomUUID();
    const result = await this.redis.getClient().set(redisKeys.lock(name), token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  /** Release a lock only if this caller still owns it. */
  async release(name: string, token: string): Promise<void> {
    try {
      await this.redis
        .getClient()
        .eval(RedisLockService.RELEASE_SCRIPT, 1, redisKeys.lock(name), token);
    } catch (error) {
      this.logger.warn(
        `redis.lock.release-failed name=${name} ${error instanceof Error ? error.message : String(error)}`,
        'Redis',
      );
    }
  }

  /**
   * Run `fn` while holding the lock. Returns null when the lock is already
   * held (the caller should treat the work as "someone else is doing it").
   * Never leaks the lock: release happens in a `finally`, and the TTL covers
   * a hard crash.
   */
  async withLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
    const token = await this.acquire(name, ttlMs);
    if (!token) {
      return null;
    }
    try {
      return await fn();
    } finally {
      await this.release(name, token);
    }
  }
}
