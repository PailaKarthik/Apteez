import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { RateLimitMonitor } from '../../common/throttle/rate-limit-monitor';
import { callerOf, requireArea } from './admin-access';

/**
 * 429 observability for on-call. Aggregates are informational: a single rate
 * limit is normal client behavior, sustained spikes are investigated per the
 * rate-limit runbook (docs/runbooks.md). Window caps at 168h.
 */
@Controller('admin/rate-limits')
export class AdminRateLimitsController {
  constructor(private readonly monitor: RateLimitMonitor) {}

  @Get()
  async summarize(@Query('hours') hoursRaw: string | undefined, @CurrentUser() user?: RequestUser) {
    requireArea(callerOf(user), 'analytics');
    const hours = hoursRaw === undefined ? 24 : Number(hoursRaw);
    return this.monitor.summarize(Number.isFinite(hours) ? hours : 24);
  }
}
