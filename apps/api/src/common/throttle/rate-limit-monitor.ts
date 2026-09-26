import { Injectable } from '@nestjs/common';
import { AppLogger } from '../logger/app-logger';
import { RedisService } from '../../redis/redis.service';

export interface RateLimitEndpointStat {
  method: string;
  path: string;
  count: number;
}

/**
 * 429 observability. Every rejected request increments minute- and day-bucket
 * Redis counters keyed by method + route template (never raw URLs, so
 * cardinality stays bounded). All writes are best-effort: monitoring must
 * never fail or slow the request path, and an unreachable Redis simply means
 * no data — the rejection itself already happened.
 *
 * A single 429 is normal client behavior, not an incident. The admin
 * endpoint exposes aggregates; the runbook defines spike thresholds.
 */
@Injectable()
export class RateLimitMonitor {
  private static readonly MINUTE_TTL_SECONDS = 3 * 3600;
  private static readonly DAY_TTL_SECONDS = 8 * 24 * 3600;
  private static readonly SCAN_LIMIT = 2000;

  constructor(
    private readonly redis: RedisService,
    private readonly logger: AppLogger,
  ) {}

  async recordRejected(input: { method: string; path: string }): Promise<void> {
    try {
      if (!this.redis.isReady()) {
        return;
      }
      const method = input.method.toUpperCase().slice(0, 10);
      const path = input.path.slice(0, 200);
      const now = new Date();
      const minute = RateLimitMonitor.stamp(now);
      const day = minute.slice(0, 8);
      await this.redis.incr(
        `ratelimit:minute:${minute}:${method}:${path}`,
        RateLimitMonitor.MINUTE_TTL_SECONDS,
      );
      await this.redis.incr(
        `ratelimit:day:${day}:${method}:${path}`,
        RateLimitMonitor.DAY_TTL_SECONDS,
      );
    } catch (error) {
      this.logger.warn(
        `ratelimit.monitor-failed ${error instanceof Error ? error.message : String(error)}`,
        'Throttler',
      );
    }
  }

  async summarize(hours = 24): Promise<{
    windowHours: number;
    total: number;
    truncated: boolean;
    byEndpoint: RateLimitEndpointStat[];
  }> {
    const windowHours = Math.min(168, Math.max(1, Math.trunc(hours) || 24));
    try {
      if (!this.redis.isReady()) {
        return { windowHours, total: 0, truncated: false, byEndpoint: [] };
      }
      const useMinutes = windowHours <= 2;
      const prefix = useMinutes ? 'ratelimit:minute:' : 'ratelimit:day:';
      const cutoff = useMinutes ? Date.now() - windowHours * 3600_000 : null;
      const keys = await this.redis.scanKeys(`${prefix}*`, RateLimitMonitor.SCAN_LIMIT);
      const truncated = keys.length >= RateLimitMonitor.SCAN_LIMIT;
      const relevant =
        cutoff === null
          ? keys
          : keys.filter((key) => {
              const stamp = key.slice(prefix.length, prefix.length + 12);
              const time = RateLimitMonitor.parseStamp(stamp);
              return time !== null && time >= cutoff;
            });
      const counts =
        relevant.length === 0
          ? []
          : ((await this.redis.getClient().mget(relevant)) as Array<string | null>);
      const byKey = new Map<string, number>();
      relevant.forEach((key, index) => {
        // Key shape minute: ratelimit:minute:<12-digit stamp>:<METHOD>:<path>
        // Key shape day:    ratelimit:day:<8-digit stamp>:<METHOD>:<path>
        const rest = key.slice(prefix.length + (useMinutes ? 12 : 8) + 1);
        const separator = rest.indexOf(':');
        if (separator <= 0) {
          return;
        }
        const endpoint = `${rest.slice(0, separator)} ${rest.slice(separator + 1)}`;
        byKey.set(endpoint, (byKey.get(endpoint) ?? 0) + Number(counts[index] ?? 0));
      });
      const byEndpoint = [...byKey.entries()]
        .map(([endpoint, count]) => {
          const separator = endpoint.indexOf(' ');
          return {
            method: endpoint.slice(0, separator),
            path: endpoint.slice(separator + 1),
            count,
          };
        })
        .filter((stat) => stat.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);
      const total = byEndpoint.reduce((sum, stat) => sum + stat.count, 0);
      return { windowHours, total, truncated, byEndpoint };
    } catch (error) {
      this.logger.warn(
        `ratelimit.summarize-failed ${error instanceof Error ? error.message : String(error)}`,
        'Throttler',
      );
      return { windowHours, total: 0, truncated: false, byEndpoint: [] };
    }
  }

  private static stamp(date: Date): string {
    const pad = (value: number, length = 2) => String(value).padStart(length, '0');
    return (
      `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
      `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`
    );
  }

  private static parseStamp(stamp: string): number | null {
    if (!/^\d{12}$/.test(stamp)) {
      return null;
    }
    const time = Date.UTC(
      Number(stamp.slice(0, 4)),
      Number(stamp.slice(4, 6)) - 1,
      Number(stamp.slice(6, 8)),
      Number(stamp.slice(8, 10)),
      Number(stamp.slice(10, 12)),
    );
    return Number.isNaN(time) ? null : time;
  }
}
