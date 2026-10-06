import { Controller, Get, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { HealthData } from '@apteez/types';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

/**
 * GET /api/v1/health — intentionally public for load balancers and uptime.
 * Throttle-exempt: the web keep-warm ticker hits this every 60s per open
 * tab and load balancers poll it — charging a Redis round trip per poll is
 * pure overhead on the hottest endpoint.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthData> {
    const { statusCode, body } = await this.health.check();
    res.status(statusCode);
    return body;
  }

  /** Liveness: process is running. No dependency checks — cheap for kubelet. */
  @Public()
  @Get('live')
  live(): { status: 'ok'; uptimeSeconds: number; timestamp: string } {
    return this.health.liveness();
  }

  /** Readiness: dependencies (DB/Redis/queues) are reachable. */
  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<HealthData> {
    const { statusCode, body } = await this.health.check();
    res.status(statusCode);
    return body;
  }
}
