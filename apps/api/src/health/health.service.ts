import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@apteez/database';
import type { DependencyHealth, HealthData } from '@apteez/types';
import type { Env } from '../config/env';
import { RedisService } from '../redis/redis.service';
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
  ) {}

  async check(): Promise<{ statusCode: number; body: HealthData }> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const degraded = database.status === 'down' || redis.status === 'down';
    return {
      statusCode: degraded ? 503 : 200,
      body: {
        status: degraded ? 'degraded' : 'ok',
        version: this.config.get('APP_VERSION', { infer: true }),
        environment: this.config.get('NODE_ENV', { infer: true }),
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        checks: { database, redis },
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
}
