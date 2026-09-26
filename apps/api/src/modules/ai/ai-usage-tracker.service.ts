import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@apteez/database';
import { AppLogger } from '../../common/logger/app-logger';
import { RedisService } from '../../redis/redis.service';
import { redisKeys } from '../../redis/redis-keys';
import type { Env } from '../../config/env';
import type { AiFeature } from './ai.constants';

export interface AiUsageRecord {
  feature: AiFeature | string;
  model: string;
  userId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  success: boolean;
  error?: string | null;
  fallbackUsed?: boolean | null;
  toolCount?: number | null;
  requestId?: string | null;
}

/**
 * Cost/usage control + telemetry. Every provider call is recorded
 * (append-only, no prompts/responses) and gated by a per-user daily budget.
 * Redis failure fails open with a warning — availability over strictness,
 * matching the HTTP throttler — while usage rows keep the audit trail.
 */
@Injectable()
export class AiUsageTrackerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: AppLogger,
  ) {}

  /** Returns false when the caller exhausted today's budget for the feature. */
  async checkBudget(
    userId: string | null | undefined,
    feature: string,
  ): Promise<{ allowed: boolean; remaining: number }> {
    const limit = this.config.get('AI_DAILY_LIMIT', { infer: true });
    if (!userId) {
      return { allowed: true, remaining: limit };
    }
    const key = redisKeys.aiBudget(userId, feature);
    try {
      if (!this.redis.isReady()) {
        return { allowed: true, remaining: limit };
      }
      const used = await this.redis.incr(key, 86_400);
      return { allowed: used <= limit, remaining: Math.max(0, limit - used) };
    } catch (error) {
      this.logger.warn(
        `ai.budget-unavailable user=${userId} feature=${feature} ${error instanceof Error ? error.message : String(error)}`,
        'AI',
      );
      return { allowed: true, remaining: limit };
    }
  }

  async record(record: AiUsageRecord): Promise<void> {
    try {
      await this.prisma.aiUsageLog.create({
        data: {
          feature: record.feature,
          model: record.model,
          userId: record.userId ?? null,
          promptTokens: record.promptTokens ?? null,
          completionTokens: record.completionTokens ?? null,
          latencyMs: record.latencyMs ?? null,
          success: record.success,
          error: record.error?.slice(0, 500) ?? null,
          fallbackUsed: record.fallbackUsed ?? false,
          toolCount: record.toolCount ?? null,
          requestId: record.requestId ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(
        `ai.usage-write-failed feature=${record.feature} ${error instanceof Error ? error.message : String(error)}`,
        'AI',
      );
    }
  }

  async summary(days = 7): Promise<
    Array<{
      feature: string;
      calls: number;
      failures: number;
      fallbacks: number;
      avgLatencyMs: number | null;
      avgToolCount: number | null;
    }>
  > {
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await this.prisma.aiUsageLog.groupBy({
      by: ['feature'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      _avg: { latencyMs: true, toolCount: true },
    });
    const failures = await this.prisma.aiUsageLog.groupBy({
      by: ['feature'],
      where: { createdAt: { gte: since }, success: false },
      _count: { _all: true },
    });
    const fallbackRows = await this.prisma.aiUsageLog.groupBy({
      by: ['feature'],
      where: { createdAt: { gte: since }, fallbackUsed: true },
      _count: { _all: true },
    });
    const failedByFeature = new Map(failures.map((row) => [row.feature, row._count._all]));
    const fallbackByFeature = new Map(fallbackRows.map((row) => [row.feature, row._count._all]));
    return rows.map((row) => ({
      feature: row.feature,
      calls: row._count._all,
      failures: failedByFeature.get(row.feature) ?? 0,
      fallbacks: fallbackByFeature.get(row.feature) ?? 0,
      avgLatencyMs: row._avg.latencyMs === null ? null : Math.round(row._avg.latencyMs),
      avgToolCount: row._avg.toolCount === null ? null : Math.round(row._avg.toolCount * 10) / 10,
    }));
  }
}
