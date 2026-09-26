import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { PrismaService } from '@apteez/database';
import type { DependencyHealth, HealthData, QueueHealth } from '@apteez/types';
import type { Env } from '../config/env';
import { RedisService } from '../redis/redis.service';
import { CHALLENGE_QUEUE, EVENT_QUEUE } from '../queue/queue.constants';
import { withTimeout } from '../common/utils/with-timeout';

const CHECK_TIMEOUT_MS = 2000;

/**
 * Liveness of the API and its required dependencies. Reports per-check
 * status plus latency — never connection strings, credentials or stack
 * traces — so load balancers and the status UI can consume it safely.
 */
@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
    @InjectQueue(CHALLENGE_QUEUE) private readonly challengeQueue: Queue,
    @InjectQueue(EVENT_QUEUE) private readonly eventQueue: Queue,
  ) {}

  /** Liveness probe: never touches dependencies. */
  liveness(): { status: 'ok'; uptimeSeconds: number; timestamp: string } {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async check(): Promise<{ statusCode: number; body: HealthData }> {
    const [database, redis, challenge, events] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkQueue(this.challengeQueue),
      this.checkQueue(this.eventQueue),
    ]);
    const degraded =
      database.status === 'down' ||
      redis.status === 'down' ||
      challenge.status === 'down' ||
      events.status === 'down';
    return {
      statusCode: degraded ? 503 : 200,
      body: {
        status: degraded ? 'degraded' : 'ok',
        version: this.config.get('APP_VERSION', { infer: true }),
        // Release identity for operators: which build is answering. Never
        // secrets or URLs — safe for load balancers and status pages.
        commit: this.config.get('GIT_SHA', { infer: true }),
        tag: this.config.get('RELEASE_TAG', { infer: true }) ?? null,
        environment: this.config.get('NODE_ENV', { infer: true }),
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        checks: {
          database,
          redis,
          queues: { [CHALLENGE_QUEUE]: challenge, [EVENT_QUEUE]: events },
        },
      },
    };
  }

  private async checkDatabase(): Promise<DependencyHealth> {
    try {
      const latencyMs = await withTimeout(this.prisma.ping(), CHECK_TIMEOUT_MS);
      return { status: 'up', latencyMs };
    } catch {
      return { status: 'down', latencyMs: null };
    }
  }

  private async checkRedis(): Promise<DependencyHealth> {
    try {
      const latencyMs = await withTimeout(this.redis.ping(), CHECK_TIMEOUT_MS);
      return { status: 'up', latencyMs };
    } catch {
      return { status: 'down', latencyMs: null };
    }
  }

  /**
   * BullMQ depth probe: waiting/active/delayed/failed counts only, no job
   * payloads. A queue that cannot be read marks the service degraded so
   * on-call sees worker/Redis trouble before users do.
   */
  private async checkQueue(queue: Queue): Promise<QueueHealth> {
    const empty: QueueHealth = {
      status: 'down',
      waiting: null,
      active: null,
      delayed: null,
      failed: null,
    };
    try {
      const counts = await withTimeout(
        queue.getJobCounts('waiting', 'active', 'delayed', 'failed', 'paused'),
        CHECK_TIMEOUT_MS,
      );
      return {
        status: 'up',
        waiting: counts.waiting + counts.paused,
        active: counts.active,
        delayed: counts.delayed,
        failed: counts.failed,
      };
    } catch {
      return empty;
    }
  }
}
