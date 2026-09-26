import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { AnalyticsService } from '../analytics/analytics.service';
import { callerOf, requireArea } from './admin-access';

const rangeSchema = z.object({ days: z.coerce.number().int().min(1).max(90).default(30) });

/** Product metrics for operators. Aggregates only — no row-level user data. */
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  async overview(@Query() query: unknown, @CurrentUser() user?: RequestUser) {
    requireArea(callerOf(user), 'analytics');
    const parsed = rangeSchema.safeParse(query);
    return this.analytics.overview(parsed.success ? parsed.data.days : 30);
  }

  @Get('funnel')
  async funnel(@Query() query: unknown, @CurrentUser() user?: RequestUser) {
    requireArea(callerOf(user), 'analytics');
    const parsed = rangeSchema.safeParse(query);
    return this.analytics.funnel(parsed.success ? parsed.data.days : 30);
  }

  @Get('retention')
  async retention(@CurrentUser() user?: RequestUser) {
    requireArea(callerOf(user), 'analytics');
    return this.analytics.retention();
  }
}
