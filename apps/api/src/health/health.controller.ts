import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { HealthData } from '@apteez/types';
import { Public } from '../common/decorators/public.decorator';
import { HealthService } from './health.service';

/** GET /api/v1/health — intentionally public for load balancers and uptime. */
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
}
