import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { AppLogger } from '../common/logger/app-logger';
import { type Env, resolveRedisUrl } from '../config/env';
import { RedisUnavailableError } from './redis.errors';

export type RedisConnectionState = 'connecting' | 'ready' | 'reconnecting' | 'closed';

export interface RedisHealth {
  status: 'up' | 'down';
  latencyMs: number | null;
  state: RedisConnectionState;
}

const SHUTDOWN_TIMEOUT_MS = 2000;
/** Minimum gap between proactive reconnect attempts (no dial storms). */
const RECONNECT_COOLDOWN_MS = 5000;

/**
 * Shared Redis access. Redis holds ephemeral/live/coordination state only
 * (matchmaking queues, live challenge state, locks, rate-limit counters,
 * caches) — permanent data always lives in PostgreSQL.
 *
 * Resilience: the client reconnects automatically, connection state is
 * tracked, and command failures while the connection is not ready surface as
 * a controlled `RedisUnavailableError` (503) instead of leaking driver errors
 * or silently succeeding. Boot stays resilient — an unavailable Redis leaves
 * the app running and `/health` degraded. Because ioredis parks the client
 * permanently after any failed (re)connect, health checks redial proactively
 * (cooldown-guarded) so one transient blip can never wedge the client until
 * process restart.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client: Redis;
  private connectionState: RedisConnectionState = 'connecting';
  private lastDialAt = 0;
  private shuttingDown = false;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly logger: AppLogger,
  ) {
    this.client = new Redis(
      resolveRedisUrl(
        this.config.get('UPSTASH_REDIS_URL', { infer: true }),
        this.config.get('REDIS_URL', { infer: true }),
      ),
      {
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        connectTimeout: 5000,
        retryStrategy: (times: number) => Math.min(times * 200, 5000),
        // Fail fast while disconnected: the default offline queue would hold
        // every command (throttle checks, session reads, health pings, caches)
        // until reconnection, hanging all HTTP traffic during an outage.
        // With the queue disabled, commands reject immediately and each
        // caller degrades explicitly (fail-open throttles/caches, 503 guards,
        // 401 sessions) instead of stalling.
        enableOfflineQueue: false,
      },
    );
    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis client error: ${error.message}`, undefined, 'Redis');
    });
    this.client.on('ready', () => {
      this.connectionState = 'ready';
      this.logger.log('Redis connection ready', 'Redis');
    });
    this.client.on('reconnecting', () => {
      this.connectionState = 'reconnecting';
    });
    this.client.on('close', () => {
      if (this.connectionState !== 'closed') {
        this.connectionState = 'reconnecting';
      }
    });
    this.client.on('end', () => {
      // No automatic retry follows: the next health check redials
      // (see tryReconnect) unless the module is shutting down.
      if (!this.shuttingDown) {
        this.connectionState = 'reconnecting';
      }
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.ping();
      this.connectionState = 'ready';
    } catch (error) {
      // Boot stays resilient: /health reports the outage instead.
      this.connectionState = 'reconnecting';
      this.logger.warn(
        `Redis unavailable at startup: ${error instanceof Error ? error.message : String(error)}`,
        'Redis',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    this.connectionState = 'closed';
    try {
      await Promise.race([
        this.client.quit(),
        new Promise((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
      ]);
    } catch {
      this.client.disconnect();
    }
  }

  /** Raw client for advanced use (pipelines, BullMQ). Errors propagate as-is. */
  getClient(): Redis {
    return this.client;
  }

  get state(): RedisConnectionState {
    return this.connectionState;
  }

  isReady(): boolean {
    return this.connectionState === 'ready';
  }

  /**
   * Proactive redial. ioredis parks the client at status "end" (no further
   * automatic retries) whenever ANY connect attempt fails — including a
   * transient blip during a background reconnect. Without this, one bad
   * millisecond means a permanently dead client until process restart.
   * Cooldown-guarded so health checks cannot dial-storm a struggling Redis.
   */
  private async tryReconnect(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }
    const now = Date.now();
    if (now - this.lastDialAt < RECONNECT_COOLDOWN_MS) {
      return;
    }
    this.lastDialAt = now;
    try {
      await this.client.connect();
    } catch {
      // Still unreachable: the next health check retries after cooldown.
    }
  }

  /** Liveness probe used by /health; never throws. */
  async checkHealth(): Promise<RedisHealth> {
    const startedAt = Date.now();
    try {
      await this.client.ping();
      this.connectionState = 'ready';
      return { status: 'up', latencyMs: Date.now() - startedAt, state: this.connectionState };
    } catch {
      await this.tryReconnect();
      return { status: 'down', latencyMs: null, state: this.connectionState };
    }
  }

  /**
   * Guard for operations that must not proceed without Redis coordination:
   * throws a controlled 503 instead of silently degrading.
   */
  async requireReady(): Promise<void> {
    if (this.connectionState === 'ready') {
      return;
    }
    const health = await this.checkHealth();
    if (health.status !== 'up') {
      throw new RedisUnavailableError();
    }
  }

  /** Liveness probe; resolves with round-trip latency in milliseconds. */
  async ping(): Promise<number> {
    const startedAt = Date.now();
    await this.client.ping();
    return Date.now() - startedAt;
  }

  async get(key: string): Promise<string | null> {
    return this.run(() => this.client.get(key));
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.run(() => this.client.set(key, value, 'EX', ttlSeconds));
    } else {
      await this.run(() => this.client.set(key, value));
    }
  }

  async del(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    if (keys.length === 0) {
      return;
    }
    await this.run(() => this.client.del(...keys));
  }

  async exists(key: string): Promise<boolean> {
    const count = await this.run(() => this.client.exists(key));
    return count === 1;
  }

  /**
   * Atomic increment with TTL refresh, for lightweight flood guards (e.g.
   * WebSocket event counters). Throws RedisUnavailableError when Redis is
   * down — callers decide between fail-open (availability) and fail-closed
   * (abuse protection) explicitly.
   */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    return this.run(async () => {
      const count = await this.client.incr(key);
      if (count === 1 && ttlSeconds > 0) {
        await this.client.expire(key, ttlSeconds);
      }
      return count;
    });
  }

  async ttlSeconds(key: string): Promise<number> {
    return this.run(() => this.client.ttl(key));
  }

  async sadd(key: string, member: string, ttlSeconds?: number): Promise<void> {
    await this.run(async () => {
      await this.client.sadd(key, member);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.expire(key, ttlSeconds);
      }
    });
  }

  async sismember(key: string, member: string): Promise<boolean> {
    const result = await this.run(() => this.client.sismember(key, member));
    return result === 1;
  }

  async srem(key: string, member: string): Promise<void> {
    await this.run(() => this.client.srem(key, member));
  }

  async smembers(key: string): Promise<string[]> {
    return this.run(() => this.client.smembers(key));
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.run(async () => {
      await this.client.expire(key, ttlSeconds);
    });
  }

  async ttl(key: string): Promise<number> {
    return this.run(() => this.client.ttl(key));
  }

  /** SCAN-based key sweep; never blocks the server with KEYS. */
  async scanKeys(pattern: string, limit = 1000): Promise<string[]> {
    const found: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.run(() =>
        this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100),
      );
      cursor = next;
      found.push(...batch);
      if (found.length >= limit) {
        break;
      }
    } while (cursor !== '0');
    return found.slice(0, limit);
  }

  private async run<T>(op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (error) {
      // Any driver-level failure (closed connection, timeout, max retries)
      // surfaces as a controlled 503 instead of a raw 500 INTERNAL_ERROR.
      // Callers that need fail-open behaviour catch RedisUnavailableError.
      this.logger.error(
        `Redis command failed while ${this.connectionState}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        undefined,
        'Redis',
      );
      if (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: unknown }).name === 'RedisUnavailableError'
      ) {
        throw error;
      }
      throw new RedisUnavailableError();
    }
  }
}
