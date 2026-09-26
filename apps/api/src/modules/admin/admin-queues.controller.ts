import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, type RequestUser } from '../../common/decorators/current-user.decorator';
import { AdminQueuesService } from './admin-queues.service';
import { callerOf, requireAnyArea } from './admin-access';

const failedQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20) });
const retrySchema = z.object({ jobId: z.string().min(1).max(128) });

/** Queue operations. Analytics-area admins can inspect; retry re-drives one job. */
@Controller('admin/queues')
export class AdminQueuesController {
  constructor(private readonly queues: AdminQueuesService) {}

  @Get()
  async overview(@CurrentUser() user?: RequestUser) {
    requireAnyArea(callerOf(user), ['analytics', 'contests', 'events']);
    return this.queues.overview();
  }

  @Get(':queue/failed')
  async failed(
    @Param('queue') queue: string,
    @Query() query: unknown,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAnyArea(callerOf(user), ['analytics', 'contests', 'events']);
    const parsed = failedQuerySchema.safeParse(query);
    return this.queues.failed(queue, parsed.success ? parsed.data.limit : 20);
  }

  @Post(':queue/retry')
  async retry(
    @Param('queue') queue: string,
    @Body() body: unknown,
    @CurrentUser() user?: RequestUser,
  ) {
    requireAnyArea(callerOf(user), ['analytics', 'contests', 'events']);
    const parsed = retrySchema.safeParse(body);
    if (!parsed.success) {
      return { retried: false };
    }
    return this.queues.retryFailed(queue, parsed.data.jobId);
  }
}
